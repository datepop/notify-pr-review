const core = require('@actions/core');
const github = require('@actions/github');
const { WebClient } = require('@slack/web-api');
const { loadConfig } = require('./src/config');
const { parsePRData, parseCommentData, extractMentions, getSlackThreadTs, getCodeOwners, PR_STATUS, getPRStatus, updatePRStatus } = require('./src/github');
const { mapGitHubUsersToSlack, mapGitHubUserToSlack, getDefaultReviewersSlackIds } = require('./src/mapper');
const { createPRNotificationMessage, sendSlackMessage, createCommentMessage, sendThreadReply, updateSlackMessage } = require('./src/slack');

async function handlePROpened(slackClient, octokit, context, config, slackChannel) {
  const prData = parsePRData(context);
  core.info(`Processing PR #${prData.number}: ${prData.title}`);

  const authorSlackId = await mapGitHubUserToSlack(
    slackClient,
    octokit,
    prData.author,
    config
  );

  const allReviewers = new Set();
  const sources = [];

  if (prData.reviewers.length > 0) {
    core.info(`Found ${prData.reviewers.length} assigned reviewers`);
    prData.reviewers.forEach(r => {
      if (r !== prData.author) {
        allReviewers.add(r);
      }
    });
    sources.push('reviewers');
  }

  const codeOwners = await getCodeOwners(
    octokit,
    context.repo.owner,
    context.repo.repo,
    prData.number
  );

  if (codeOwners.length > 0) {
    core.info(`Found ${codeOwners.length} code owners`);
    codeOwners.forEach(o => {
      if (o !== prData.author) {
        allReviewers.add(o);
      }
    });
    sources.push('codeowners');
  }

  if (allReviewers.size > 0) {
    core.info(`Filtered out PR author (${prData.author}) from reviewers`);
  }

  let reviewerSlackIds = [];
  let reviewerSource = 'none';

  if (allReviewers.size > 0) {
    reviewerSlackIds = await mapGitHubUsersToSlack(
      slackClient,
      octokit,
      Array.from(allReviewers),
      config
    );
    reviewerSource = sources.join(' + ');
  }

  if (config.default_reviewers.length > 0) {
    core.info(`Found ${config.default_reviewers.length} default reviewers`);
    const defaultSlackIds = await getDefaultReviewersSlackIds(
      slackClient,
      config.default_reviewers
    );

    const uniqueSlackIds = new Set([...reviewerSlackIds, ...defaultSlackIds]);
    reviewerSlackIds = Array.from(uniqueSlackIds);

    if (defaultSlackIds.length > 0) {
      sources.push('default');
      reviewerSource = sources.join(' + ');
    }
  }

  if (reviewerSlackIds.length === 0) {
    core.info('No reviewers found from any source, will notify channel only');
  }

  core.info(`Notifying ${reviewerSlackIds.length} Slack users (source: ${reviewerSource})`);

  const initialStatus = PR_STATUS.REVIEW_PENDING;
  const message = createPRNotificationMessage(prData, reviewerSlackIds, authorSlackId, initialStatus);
  const result = await sendSlackMessage(slackClient, slackChannel, message);

  await octokit.rest.pulls.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: prData.number,
    body: prData.body + `\n\n<!-- slack-thread-ts: ${result.ts} -->\n<!-- slack-status: ${initialStatus} -->`
  });

  core.info(`Saved Slack thread ts and status to PR #${prData.number}`);
  core.info('✅ PR notification sent successfully!');
}

async function handleComment(slackClient, octokit, context, config, slackChannel) {
  const commentData = parseCommentData(context);
  core.info(`Processing ${commentData.eventType} on PR #${commentData.prNumber}`);

  if (commentData.author === 'github-actions[bot]') {
    core.info('Skipping notification for GitHub Actions bot comment');
    return;
  }

  const threadTs = await getSlackThreadTs(
    octokit,
    context.repo.owner,
    context.repo.repo,
    commentData.prNumber
  );

  if (!threadTs) {
    core.warning('No Slack thread found for this PR, skipping notification');
    return;
  }

  // Get current PR status
  const currentStatus = await getPRStatus(
    octokit,
    context.repo.owner,
    context.repo.repo,
    commentData.prNumber
  );

  // Determine new status based on comment type
  let newStatus = currentStatus;

  if (commentData.reviewState === 'approved') {
    newStatus = PR_STATUS.APPROVED;
    core.info('Review approved - updating status to approved');
  } else if (commentData.reviewState === 'changes_requested') {
    newStatus = PR_STATUS.CHANGES_REQUESTED;
    core.info('Changes requested - updating status to changes-requested');
  } else if (currentStatus === PR_STATUS.REVIEW_PENDING) {
    // First comment on a review-pending PR changes status to in-review
    newStatus = PR_STATUS.IN_REVIEW;
    core.info('First comment detected - updating status to in-review');
  }

  if (newStatus !== currentStatus) {
    await updatePRStatus(
      octokit,
      context.repo.owner,
      context.repo.repo,
      commentData.prNumber,
      newStatus
    );

    const { data: pr } = await octokit.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: commentData.prNumber
    });

    const prData = {
      ...parsePRData({ payload: { pull_request: pr } }),
      body: pr.body
    };

    const allReviewers = new Set();
    if (pr.requested_reviewers && pr.requested_reviewers.length > 0) {
      pr.requested_reviewers.forEach(r => {
        if (r.login !== pr.user.login) {
          allReviewers.add(r.login);
        }
      });
    }

    const reviewerSlackIds = await mapGitHubUsersToSlack(
      slackClient,
      octokit,
      Array.from(allReviewers),
      config
    );

    const authorSlackIdForUpdate = await mapGitHubUserToSlack(
      slackClient,
      octokit,
      pr.user.login,
      config
    );

    const updatedMessage = createPRNotificationMessage(
      prData,
      reviewerSlackIds,
      authorSlackIdForUpdate,
      newStatus
    );

    await updateSlackMessage(slackClient, slackChannel, threadTs, updatedMessage);
    core.info(`✅ Slack message updated with new status: ${newStatus}`);
  }

  let targetUsers = [];

  if (commentData.reviewState === 'approved' || commentData.reviewState === 'changes_requested') {
    const { data: pr } = await octokit.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: commentData.prNumber
    });
    targetUsers.push(pr.user.login);
    core.info(`Review notification - notifying PR author: ${pr.user.login}`);
  }

  const mentions = extractMentions(commentData.body);
  if (mentions.length > 0) {
    targetUsers.push(...mentions);
    core.info(`Found ${mentions.length} mentions: ${mentions.join(', ')}`);
  }

  if (targetUsers.length === 0) {
    core.info('No mentions found and not a review, skipping notification');
    return;
  }

  targetUsers = [...new Set(targetUsers)];

  const targetSlackIds = await mapGitHubUsersToSlack(
    slackClient,
    octokit,
    targetUsers,
    config
  );

  if (targetSlackIds.length === 0) {
    core.warning('Could not find Slack users for any mentioned users');
    return;
  }

  const authorSlackId = await mapGitHubUserToSlack(
    slackClient,
    octokit,
    commentData.author,
    config
  );

  const message = createCommentMessage(commentData, targetSlackIds, authorSlackId, null);
  await sendThreadReply(slackClient, slackChannel, threadTs, message);

  core.info(`✅ Comment notification sent to ${targetSlackIds.length} users`);
}

async function run() {
  try {
    const slackBotToken = core.getInput('slack_bot_token', { required: true });
    const slackChannel = core.getInput('slack_channel', { required: true });
    const githubToken = core.getInput('github_token', { required: true });
    const configPath = core.getInput('config_path');

    core.info('Starting PR Review Slack Notifier...');

    const slackClient = new WebClient(slackBotToken);
    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    const config = loadConfig(configPath);
    core.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);

    const eventName = context.eventName;
    core.info(`Event type: ${eventName}`);

    if (eventName === 'pull_request') {
      await handlePROpened(slackClient, octokit, context, config, slackChannel);
    } else if (eventName === 'issue_comment' || eventName === 'pull_request_review' || eventName === 'pull_request_review_comment') {
      await handleComment(slackClient, octokit, context, config, slackChannel);
    } else {
      core.warning(`Unsupported event type: ${eventName}`);
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    core.debug(error.stack);
  }
}

run();
