const core = require('@actions/core');
const github = require('@actions/github');
const { WebClient } = require('@slack/web-api');
const { loadConfig } = require('./src/config');
const { parsePRData } = require('./src/github');
const { mapGitHubUsersToSlack, mapGitHubUserToSlack, getDefaultReviewersSlackIds } = require('./src/mapper');
const { createPRNotificationMessage, sendSlackMessage } = require('./src/slack');

async function run() {
  try {
    // Get inputs
    const slackBotToken = core.getInput('slack_bot_token', { required: true });
    const slackChannel = core.getInput('slack_channel', { required: true });
    const githubToken = core.getInput('github_token', { required: true });
    const configPath = core.getInput('config_path');

    core.info('Starting PR Review Slack Notifier...');

    // Initialize clients
    const slackClient = new WebClient(slackBotToken);
    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    // Load configuration
    const config = loadConfig(configPath);
    core.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);

    // Parse PR data
    const prData = parsePRData(context);
    core.info(`Processing PR #${prData.number}: ${prData.title}`);

    // Map PR author to Slack
    const authorSlackId = await mapGitHubUserToSlack(
      slackClient,
      octokit,
      prData.author,
      config
    );

    // Determine reviewers
    let reviewerSlackIds = [];

    if (prData.reviewers.length > 0) {
      // Use assigned reviewers
      core.info(`Found ${prData.reviewers.length} assigned reviewers`);
      reviewerSlackIds = await mapGitHubUsersToSlack(
        slackClient,
        octokit,
        prData.reviewers,
        config
      );
    } else if (config.default_reviewers.length > 0) {
      // Use default reviewers if no reviewers assigned
      core.info('No reviewers assigned, using default reviewers');
      reviewerSlackIds = await getDefaultReviewersSlackIds(
        slackClient,
        config.default_reviewers
      );
    } else {
      core.warning('No reviewers found and no default reviewers configured');
    }

    core.info(`Notifying ${reviewerSlackIds.length} Slack users`);

    // Create and send Slack message
    const message = createPRNotificationMessage(prData, reviewerSlackIds, authorSlackId);
    await sendSlackMessage(slackClient, slackChannel, message);

    core.info('✅ Notification sent successfully!');

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    core.debug(error.stack);
  }
}

run();
