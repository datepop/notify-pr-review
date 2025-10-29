const core = require('@actions/core');

/**
 * Parse PR data from GitHub context
 * @param {Object} context - GitHub context from @actions/github
 * @returns {Object} Parsed PR data
 */
function parsePRData(context) {
  const { pull_request } = context.payload;

  if (!pull_request) {
    throw new Error('This action must be triggered by a pull_request event');
  }

  const prData = {
    number: pull_request.number,
    title: pull_request.title,
    url: pull_request.html_url,
    author: pull_request.user.login,
    authorUrl: pull_request.user.html_url,
    body: pull_request.body || '',
    base: pull_request.base.ref,
    head: pull_request.head.ref,
    additions: pull_request.additions || 0,
    deletions: pull_request.deletions || 0,
    changedFiles: pull_request.changed_files || 0,
    isDraft: pull_request.draft || false,
    reviewers: (pull_request.requested_reviewers || []).map(r => r.login),
    assignees: (pull_request.assignees || []).map(a => a.login),
    repo: {
      name: context.payload.repository.name,
      fullName: context.payload.repository.full_name,
      url: context.payload.repository.html_url
    }
  };

  core.debug(`Parsed PR data: ${JSON.stringify(prData, null, 2)}`);

  return prData;
}

/**
 * Get a summary of the PR body (first 3 lines or 200 chars)
 * @param {string} body - PR body text
 * @returns {string} Summarized body
 */
function summarizePRBody(body) {
  if (!body || body.trim().length === 0) {
    return '_설명 없음_';
  }

  const lines = body.split('\n').filter(line => line.trim().length > 0);
  const summary = lines.slice(0, 3).join('\n');

  if (summary.length > 200) {
    return summary.substring(0, 197) + '...';
  }

  return summary || '_설명 없음_';
}

/**
 * Parse comment data from GitHub context
 * @param {Object} context - GitHub context from @actions/github
 * @returns {Object} Parsed comment data
 */
function parseCommentData(context) {
  const eventName = context.eventName;
  let commentData = {
    eventType: eventName,
    prNumber: null,
    author: null,
    body: null,
    url: null,
    reviewState: null
  };

  if (eventName === 'issue_comment') {
    const { issue, comment } = context.payload;
    if (!issue.pull_request) {
      throw new Error('issue_comment event is not from a pull request');
    }
    commentData.prNumber = issue.number;
    commentData.author = comment.user.login;
    commentData.body = comment.body;
    commentData.url = comment.html_url;
  } else if (eventName === 'pull_request_review') {
    const { pull_request, review } = context.payload;
    commentData.prNumber = pull_request.number;
    commentData.author = review.user.login;
    commentData.body = review.body || '';
    commentData.url = review.html_url;
    commentData.reviewState = review.state;
  } else if (eventName === 'pull_request_review_comment') {
    const { pull_request, comment } = context.payload;
    commentData.prNumber = pull_request.number;
    commentData.author = comment.user.login;
    commentData.body = comment.body;
    commentData.url = comment.html_url;
  } else {
    throw new Error(`Unsupported event type: ${eventName}`);
  }

  core.debug(`Parsed comment data: ${JSON.stringify(commentData, null, 2)}`);

  return commentData;
}

/**
 * Extract GitHub username mentions from text
 * @param {string} text - Comment body text
 * @returns {Array<string>} Array of mentioned usernames
 */
function extractMentions(text) {
  if (!text) return [];

  const mentionPattern = /@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)/g;
  const matches = text.matchAll(mentionPattern);
  const mentions = [...matches].map(match => match[1]);

  return [...new Set(mentions)];
}

/**
 * Get Slack thread timestamp from PR body
 * @param {Object} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} prNumber - PR number
 * @returns {Promise<string|null>} Slack thread ts or null
 */
async function getSlackThreadTs(octokit, owner, repo, prNumber) {
  try {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });

    const body = pr.body || '';
    const match = body.match(/<!-- slack-thread-ts: (.+?) -->/);

    if (match && match[1]) {
      core.debug(`Found Slack thread ts: ${match[1]}`);
      return match[1];
    }

    core.warning(`No Slack thread ts found in PR #${prNumber}`);
    return null;
  } catch (error) {
    core.error(`Failed to get Slack thread ts: ${error.message}`);
    return null;
  }
}

/**
 * Get changed files in PR
 * @param {Object} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} prNumber - PR number
 * @returns {Promise<Array<string>>} Array of changed file paths
 */
async function getChangedFiles(octokit, owner, repo, prNumber) {
  try {
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber
    });

    return files.map(file => file.filename);
  } catch (error) {
    core.warning(`Failed to get changed files: ${error.message}`);
    return [];
  }
}

/**
 * Parse CODEOWNERS file
 * @param {string} content - CODEOWNERS file content
 * @returns {Array<Object>} Array of {pattern, owners}
 */
function parseCodeowners(content) {
  const rules = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const pattern = parts[0];
    const owners = parts.slice(1)
      .filter(o => o.startsWith('@'))
      .map(o => o.substring(1));

    if (owners.length > 0) {
      rules.push({ pattern, owners });
    }
  }

  return rules.reverse();
}

/**
 * Match file to CODEOWNERS pattern
 * @param {string} file - File path
 * @param {string} pattern - CODEOWNERS pattern
 * @returns {boolean} Whether file matches pattern
 */
function matchPattern(file, pattern) {
  if (pattern === '*') return true;

  if (pattern.startsWith('*.')) {
    const ext = pattern.substring(1);
    return file.endsWith(ext);
  }

  if (pattern.endsWith('/')) {
    return file.startsWith(pattern) || file.startsWith(pattern.substring(0, pattern.length - 1));
  }

  if (pattern.startsWith('/')) {
    return file === pattern.substring(1) || file.startsWith(pattern.substring(1) + '/');
  }

  return file.includes(pattern);
}

/**
 * Get code owners from CODEOWNERS file
 * @param {Object} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} prNumber - PR number
 * @returns {Promise<Array<string>>} Array of owner usernames
 */
async function getCodeOwners(octokit, owner, repo, prNumber) {
  try {
    const changedFiles = await getChangedFiles(octokit, owner, repo, prNumber);
    if (changedFiles.length === 0) {
      return [];
    }

    const paths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
    let codeownersContent = null;

    for (const path of paths) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path
        });

        if (data.content) {
          codeownersContent = Buffer.from(data.content, 'base64').toString('utf-8');
          core.info(`Found CODEOWNERS at ${path}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!codeownersContent) {
      core.debug('No CODEOWNERS file found');
      return [];
    }

    const rules = parseCodeowners(codeownersContent);
    const ownersSet = new Set();

    for (const file of changedFiles) {
      for (const rule of rules) {
        if (matchPattern(file, rule.pattern)) {
          rule.owners.forEach(owner => ownersSet.add(owner));
          break;
        }
      }
    }

    const owners = Array.from(ownersSet);
    if (owners.length > 0) {
      core.info(`Found ${owners.length} code owners from CODEOWNERS: ${owners.join(', ')}`);
    }

    return owners;
  } catch (error) {
    core.warning(`Failed to get code owners: ${error.message}`);
    return [];
  }
}

module.exports = {
  parsePRData,
  summarizePRBody,
  parseCommentData,
  extractMentions,
  getSlackThreadTs,
  getCodeOwners
};
