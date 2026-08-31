/**
 * Puts the Apple team back into the Xcode project.
 *
 * `ios/` is generated and git-ignored, so every `expo prebuild` writes a fresh
 * project with no `DEVELOPMENT_TEAM` — and a Release build for a device cannot
 * sign without one. It was set by hand in Xcode, which meant it survived
 * exactly until the next prebuild, and then a build failed for a reason that
 * looks nothing like "the project was regenerated".
 *
 * A plugin rather than a note in a file somewhere: this runs as part of the
 * prebuild that loses it, so the two cannot drift apart.
 *
 * The team id is not a secret. It appears in the metadata of every app Apple
 * ships and identifies the account rather than authorising anything.
 */
const { withXcodeProject } = require('expo/config-plugins');

const TEAM = '3DZVS28VX3';

module.exports = function withAppleTeam(config) {
  return withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      // The section holds comment entries as bare strings alongside the real
      // ones, and the pods project's configurations have no product to sign.
      if (typeof entry === 'string' || !entry.buildSettings) continue;
      if (entry.buildSettings.PRODUCT_NAME === undefined) continue;

      entry.buildSettings.DEVELOPMENT_TEAM = TEAM;
    }

    return cfg;
  });
};
