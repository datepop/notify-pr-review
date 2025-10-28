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

module.exports = {
  createPRNotificationMessage,
  sendSlackMessage
};
