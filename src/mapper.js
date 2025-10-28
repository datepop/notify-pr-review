const core = require('@actions/core');

/**
 * Convert email to Slack User ID using Slack API
 * @param {Object} slackClient - Slack WebClient instance
 * @param {string} email - Email address
 * @returns {Promise<string|null>} Slack User ID or null
 */
async function emailToSlackId(slackClient, email) {
  try {
    const result = await slackClient.users.lookupByEmail({ email });
    if (result.ok && result.user) {
      return result.user.id;
    }
  } catch (error) {
    core.debug(`Failed to find Slack user by email ${email}: ${error.message}`);
  }
  return null;
}

/**
 * Get GitHub user's email from GitHub API
 * @param {Object} octokit - GitHub API client
 * @param {string} username - GitHub username
 * @returns {Promise<string|null>} Email or null
 */
async function getGitHubUserEmail(octokit, username) {
  try {
    const { data: user } = await octokit.rest.users.getByUsername({ username });
    return user.email;
  } catch (error) {
    core.debug(`Failed to get GitHub user email for ${username}: ${error.message}`);
    return null;
  }
}

/**
 * Map GitHub username to Slack User ID
 * @param {Object} slackClient - Slack WebClient instance
 * @param {Object} octokit - GitHub API client
 * @param {string} githubUsername - GitHub username
 * @param {Object} config - Configuration object
 * @returns {Promise<string|null>} Slack User ID or null
 */
async function mapGitHubUserToSlack(slackClient, octokit, githubUsername, config) {
  // 1. Check if there's a mapping in config file
  const mappedEmail = config.email_mappings[githubUsername];
  if (mappedEmail) {
    core.debug(`Found mapping for ${githubUsername} -> ${mappedEmail}`);
    const slackId = await emailToSlackId(slackClient, mappedEmail);
    if (slackId) {
      return slackId;
    }
  }

  // 2. Try auto-matching by GitHub email if enabled
  if (config.auto_match_by_email) {
    core.debug(`Attempting auto-match for ${githubUsername}`);
    const githubEmail = await getGitHubUserEmail(octokit, githubUsername);
    if (githubEmail) {
      const slackId = await emailToSlackId(slackClient, githubEmail);
      if (slackId) {
        core.info(`Auto-matched ${githubUsername} via email ${githubEmail}`);
        return slackId;
      }
    }
  }

  core.warning(`Could not find Slack user for GitHub user: ${githubUsername}`);
  return null;
}

/**
 * Map multiple GitHub users to Slack User IDs
 * @param {Object} slackClient - Slack WebClient instance
 * @param {Object} octokit - GitHub API client
 * @param {Array<string>} githubUsernames - Array of GitHub usernames
 * @param {Object} config - Configuration object
 * @returns {Promise<Array<string>>} Array of Slack User IDs
 */
async function mapGitHubUsersToSlack(slackClient, octokit, githubUsernames, config) {
  const slackIds = [];

  for (const username of githubUsernames) {
    const slackId = await mapGitHubUserToSlack(slackClient, octokit, username, config);
    if (slackId) {
      slackIds.push(slackId);
    }
  }

  return slackIds;
}

/**
 * Get default reviewers as Slack User IDs
 * @param {Object} slackClient - Slack WebClient instance
 * @param {Array<string>} defaultReviewers - Array of emails
 * @returns {Promise<Array<string>>} Array of Slack User IDs
 */
async function getDefaultReviewersSlackIds(slackClient, defaultReviewers) {
  const slackIds = [];

  for (const email of defaultReviewers) {
    const slackId = await emailToSlackId(slackClient, email);
    if (slackId) {
      slackIds.push(slackId);
    } else {
      core.warning(`Could not find Slack user for default reviewer email: ${email}`);
    }
  }

  return slackIds;
}

module.exports = {
  emailToSlackId,
  mapGitHubUserToSlack,
  mapGitHubUsersToSlack,
  getDefaultReviewersSlackIds
};
