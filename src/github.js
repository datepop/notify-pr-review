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

module.exports = {
  parsePRData,
  summarizePRBody
};
