const fs = require('fs');
const yaml = require('js-yaml');
const core = require('@actions/core');
const userMappings = require('./user-mappings');

/**
 * Load configuration from YAML file
 * @param {string} configPath - Path to config file
 * @returns {Object} Configuration object
 */
function loadConfig(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      core.info(`Config file not found at ${configPath}, using defaults`);
      return {
        email_mappings: userMappings,
        default_reviewers: [],
        auto_match_by_email: true
      };
    }

    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents);

    return {
      email_mappings: userMappings,
      default_reviewers: config.default_reviewers || [],
      auto_match_by_email: config.auto_match_by_email !== false
    };
  } catch (error) {
    core.warning(`Failed to load config file: ${error.message}`);
    return {
      email_mappings: userMappings,
      default_reviewers: [],
      auto_match_by_email: true
    };
  }
}

module.exports = { loadConfig };
