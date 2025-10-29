const fs = require('fs');
const yaml = require('js-yaml');
const core = require('@actions/core');

/**
 * Load user mappings from input
 * @returns {Object} User mappings object
 */
function loadUserMappings() {
  const userMappingsInput = core.getInput('user_mappings');

  if (userMappingsInput) {
    try {
      const mappings = JSON.parse(userMappingsInput);
      core.info('Using user mappings from Secrets');
      return mappings;
    } catch (error) {
      core.warning(`Failed to parse user_mappings input: ${error.message}`);
    }
  }

  core.info('No user mappings provided, relying on auto_match_by_email');
  return {};
}

/**
 * Load configuration from YAML file
 * @param {string} configPath - Path to config file
 * @returns {Object} Configuration object
 */
function loadConfig(configPath) {
  const mappings = loadUserMappings();

  try {
    if (!fs.existsSync(configPath)) {
      core.info(`Config file not found at ${configPath}, using defaults`);
      return {
        email_mappings: mappings,
        default_reviewers: [],
        auto_match_by_email: true
      };
    }

    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents);

    return {
      email_mappings: mappings,
      default_reviewers: config.default_reviewers || [],
      auto_match_by_email: config.auto_match_by_email !== false
    };
  } catch (error) {
    core.warning(`Failed to load config file: ${error.message}`);
    return {
      email_mappings: mappings,
      default_reviewers: [],
      auto_match_by_email: true
    };
  }
}

module.exports = { loadConfig };
