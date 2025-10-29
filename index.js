const core = require('@actions/core');
const github = require('@actions/github');
const { WebClient } = require('@slack/web-api');
const { loadConfig } = require('./src/config');
const { parsePRData, parseCommentData, extractMentions, getSlackThreadTs } = require('./src/github');
const { mapGitHubUsersToSlack, mapGitHubUserToSlack, getDefaultReviewersSlackIds } = require('./src/mapper');
const { createPRNotificationMessage, sendSlackMessage, createCommentMessage, sendThreadReply } = require('./src/slack');

async function handlePROpened(slackClient, octokit, context, config, slackChannel) {
  const prData = parsePRData(context);
  core.info(`Processing PR #${prData.number}: ${prData.title}`);

  const authorSlackId = await mapGitHubUserToSlack(
    slackClient,
    octokit,
    prData.author,
    config
  );

  let reviewerSlackIds = [];

  if (prData.reviewers.length > 0) {
    core.info(`Found ${prData.reviewers.length} assigned reviewers`);
    reviewerSlackIds = await mapGitHubUsersToSlack(
      slackClient,
      octokit,
      prData.reviewers,
      config
    );
  } else if (config.default_reviewers.length > 0) {
    core.info('No reviewers assigned, using default reviewers');
    reviewerSlackIds = await getDefaultReviewersSlackIds(
      slackClient,
      config.default_reviewers
    );
  } else {
    core.warning('No reviewers found and no default reviewers configured');
  }

  core.info(`Notifying ${reviewerSlackIds.length} Slack users`);

  const message = createPRNotificationMessage(prData, reviewerSlackIds, authorSlackId);
  const result = await sendSlackMessage(slackClient, slackChannel, message);

  await octokit.rest.pulls.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: prData.number,
    body: prData.body + `\n\n<!-- slack-thread-ts: ${result.ts} -->`
  });

  core.info(`Saved Slack thread ts to PR #${prData.number}`);
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
