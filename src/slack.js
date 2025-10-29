const core = require('@actions/core');
const { summarizePRBody } = require('./github');

/**
 * Create Slack Block Kit message for PR notification
 * @param {Object} prData - Parsed PR data
 * @param {Array<string>} reviewerSlackIds - Array of Slack User IDs
 * @param {string} authorSlackId - Author's Slack User ID (optional)
 * @returns {Object} Slack message payload
 */
function createPRNotificationMessage(prData, reviewerSlackIds, authorSlackId = null) {
  const reviewerMentions = reviewerSlackIds.map(id => `<@${id}>`).join(' ');
  const authorMention = authorSlackId ? `<@${authorSlackId}>` : `@${prData.author}`;

  const statusEmoji = prData.isDraft ? '📝' : '🟡';
  const statusText = prData.isDraft ? '초안 (Draft)' : '리뷰 대기중';

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '👀 코드 리뷰 요청'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${prData.url}|${prData.title}>*\n\`${prData.head}\` → \`${prData.base}\``
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*작성자:*\n${authorMention}`
        },
        {
          type: 'mrkdwn',
          text: `*리뷰어:*\n${reviewerMentions || '_없음_'}`
        },
        {
          type: 'mrkdwn',
          text: `*변경사항:*\n+${prData.additions} / -${prData.deletions} (${prData.changedFiles} files)`
        },
        {
          type: 'mrkdwn',
          text: `*상태:*\n${statusEmoji} ${statusText}`
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summarizePRBody(prData.body)
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'PR 보기'
          },
          url: prData.url,
          style: 'primary'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '변경사항'
          },
          url: `${prData.url}/files`
        }
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📍 ${prData.repo.name} • 방금 전`
        }
      ]
    }
  ];

  return {
    blocks,
    text: `새로운 PR: ${prData.title}` // Fallback text for notifications
  };
}

/**
 * Send Slack message
 * @param {Object} slackClient - Slack WebClient instance
 * @param {string} channel - Slack channel ID or name
 * @param {Object} message - Message payload
 * @returns {Promise<Object>} Slack API response
 */
async function sendSlackMessage(slackClient, channel, message) {
  try {
    const result = await slackClient.chat.postMessage({
      channel,
      ...message
    });

    if (result.ok) {
      core.info(`Slack message sent successfully to ${channel}`);
      return result;
    } else {
      throw new Error(`Slack API returned error: ${result.error}`);
    }
  } catch (error) {
    core.error(`Failed to send Slack message: ${error.message}`);
    throw error;
  }
}

/**
 * Create Slack message for comment notification
 * @param {Object} commentData - Parsed comment data
 * @param {Array<string>} mentionedSlackIds - Array of mentioned Slack User IDs
 * @param {string} authorSlackId - Comment author's Slack User ID
 * @param {Object} prData - PR data for context
 * @returns {Object} Slack message payload
 */
function createCommentMessage(commentData, mentionedSlackIds, authorSlackId, prData) {
  const authorMention = authorSlackId ? `<@${authorSlackId}>` : `@${commentData.author}`;
  const mentions = mentionedSlackIds.map(id => `<@${id}>`).join(' ');

  let emoji = '💬';
  let title = '새 코멘트';

  if (commentData.reviewState) {
    if (commentData.reviewState === 'approved') {
      emoji = '✅';
      title = '승인 (Approved)';
    } else if (commentData.reviewState === 'changes_requested') {
      emoji = '🔴';
      title = '변경 요청 (Changes Requested)';
    } else if (commentData.reviewState === 'commented') {
      emoji = '💬';
      title = '리뷰 코멘트';
    }
  } else if (commentData.eventType === 'pull_request_review_comment') {
    emoji = '📝';
    title = '코드 라인 코멘트';
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${title}*\n${authorMention}님이 코멘트를 남겼습니다`
      }
    }
  ];

  if (commentData.body && commentData.body.trim()) {
    const truncatedBody = commentData.body.length > 500
      ? commentData.body.substring(0, 497) + '...'
      : commentData.body;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `> ${truncatedBody.split('\n').join('\n> ')}`
      }
    });
  }

  if (mentions) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `👤 멘션: ${mentions}`
        }
      ]
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '코멘트 보기'
        },
        url: commentData.url,
        style: commentData.reviewState === 'changes_requested' ? 'danger' : 'primary'
      }
    ]
  });

  return {
    blocks,
    text: `${title}: ${commentData.author}`
  };
}

/**
 * Send Slack message as thread reply
 * @param {Object} slackClient - Slack WebClient instance
 * @param {string} channel - Slack channel ID or name
 * @param {string} threadTs - Parent message timestamp
 * @param {Object} message - Message payload
 * @returns {Promise<Object>} Slack API response
 */
async function sendThreadReply(slackClient, channel, threadTs, message) {
  try {
    const result = await slackClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      ...message
    });

    if (result.ok) {
      core.info(`Slack thread reply sent successfully to ${channel}`);
      return result;
    } else {
      throw new Error(`Slack API returned error: ${result.error}`);
    }
  } catch (error) {
    core.error(`Failed to send Slack thread reply: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createPRNotificationMessage,
  sendSlackMessage,
  createCommentMessage,
  sendThreadReply
};
