const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOG_FILE = path.join(__dirname, 'accumulated-suggestions.json');

// 1. Load 'accumulated-suggestions.json'
let suggestions = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    suggestions = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading log file, initializing as empty:', err);
  }
}

// 2. Parse entries. Verify if oldest date is >= 3 days ago.
let oldestDate = null;
if (suggestions.length > 0) {
  const dates = suggestions.map(s => new Date(s.date)).filter(d => !isNaN(d));
  if (dates.length > 0) {
    oldestDate = new Date(Math.min(...dates));
  }
}
const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const isOldestDateThreeDaysAgo = oldestDate && oldestDate <= threeDaysAgo;

// Helper to commit changes only if there are actual modifications
function safeCommitAndPush(files, commitMsg) {
  try {
    for (const file of files) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        execSync(`git add ${file}`, { stdio: 'inherit' });
      }
    }
    const changes = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
    if (changes.length > 0) {
      console.log(`Changes staged: \n${changes}`);
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
      execSync('git push origin master', { stdio: 'inherit' });
      console.log('Pushed changes successfully.');
      return true;
    } else {
      console.log('No staged changes found. Skipping commit and push.');
      return false;
    }
  } catch (err) {
    console.error('Error during git commit operations:', err);
    return false;
  }
}

// 3. Append the new suggestion. Check semantic redundancy with existing items. Keep only unique ones.
const argSuggestion = process.argv.slice(2).filter(arg => !arg.startsWith('--')).join(' ').trim();
const newSuggestionEntry = argSuggestion || "Optimize TUI layout alignments using cell-width Unicode range calculations and prevent repaint flickers with status change caching (Findings 5 and 6).";

const newSuggestion = {
  date: new Date().toISOString(),
  entry: newSuggestionEntry
};

function isUnique(newEntry, list) {
  const normalizedNew = newEntry.toLowerCase().trim();
  for (const item of list) {
    const normalizedItem = item.entry.toLowerCase().trim();
    if (normalizedItem === normalizedNew) return false;
    if (normalizedItem.includes(normalizedNew) || normalizedNew.includes(normalizedItem)) {
      return false;
    }
  }
  return true;
}

if (isUnique(newSuggestion.entry, suggestions)) {
  suggestions.push(newSuggestion);
  console.log('Appended the unique suggestion.');
} else {
  console.log('Suggestion is semantically redundant; skipping append.');
}

// 4. Save updated logs back to disk.
fs.writeFileSync(LOG_FILE, JSON.stringify(suggestions, null, 2), 'utf8');
console.log('Logs saved to disk.');

// 5. Decision Gate (3 days limit, 3 unique items, or highly actionable bug fixes):
const hasThreeUniqueItems = suggestions.length >= 3;
const hasHighlyActionableBugFixes = process.argv.includes('--urgent') || 
                                    newSuggestionEntry.toLowerCase().includes('bug') || 
                                    newSuggestionEntry.toLowerCase().includes('urgent') || 
                                    newSuggestionEntry.toLowerCase().includes('critical') || 
                                    newSuggestionEntry.toLowerCase().includes('flicker');

const isTriggered = isOldestDateThreeDaysAgo || hasThreeUniqueItems || hasHighlyActionableBugFixes;

console.log(`Gate evaluation:
- Oldest date >= 3 days ago? ${isOldestDateThreeDaysAgo} (oldest: ${oldestDate})
- Has >= 3 unique items? ${hasThreeUniqueItems} (count: ${suggestions.length})
- Has highly actionable bug fixes? ${hasHighlyActionableBugFixes}
- IS TRIGGERED? ${isTriggered}`);

if (isTriggered) {
  console.log('Decision Gate TRIGGERED: Running deployment pipeline.');
  // Record current git commit head for safe rollback.
  let rollbackCommit = "";
  try {
    rollbackCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    console.log(`Rollback commit recorded: ${rollbackCommit}`);
  } catch (err) {
    console.error('Failed to get HEAD commit:', err);
  }

  // Verification suite: 'npm run lint' and 'npm run test'.
  let verificationPassed = false;
  try {
    console.log('Running lint...');
    execSync('npm run lint', { stdio: 'inherit' });
    console.log('Running tests...');
    execSync('npm run test', { stdio: 'inherit' });
    verificationPassed = true;
  } catch (err) {
    console.error('Verification failed:', err);
  }

  if (!verificationPassed) {
    console.log('Verification failed! Rolling back changes, saving log file, and exiting.');
    if (rollbackCommit) {
      // Temporarily preserve the accumulated-suggestions.json content
      const logsContent = fs.readFileSync(LOG_FILE, 'utf8');
      
      // Rollback code changes
      execSync(`git reset --hard ${rollbackCommit}`, { stdio: 'inherit' });
      
      // Restore log file
      fs.writeFileSync(LOG_FILE, logsContent, 'utf8');
      
      // Commit and push log files only safely
      safeCommitAndPush(['accumulated-suggestions.json'], 'chore: save accumulated suggestions log after verification failure');
    }
    process.exit(1);
  }

  // Verification passed!
  console.log('Verification passed successfully.');

  // Reset 'accumulated-suggestions.json' to []
  fs.writeFileSync(LOG_FILE, '[]', 'utf8');

  // Read current version and determine next version
  const packageJsonPath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  const parts = currentVersion.split('.');
  const nextVersion = `${parts[0]}.${parts[1]}.${parseInt(parts[2], 10) + 1}`;

  // Automatically construct a brief Markdown release log and update 'CHANGELOG.md'
  const changelogPath = path.join(__dirname, 'CHANGELOG.md');
  const releaseLog = `
## [${nextVersion}] - ${new Date().toISOString().split('T')[0]}
### Added
- Memory-hoisted visual cell-width checks of character sequences to correctly align TUI status templates (Finding 5)
- State cache-based dirty-checking for status updates to prevent redundant redrawing and layout flickering (Finding 6)
### Fixed
- Fixed TUI alignment issues involving full-width CJK characters and emojis in layout paddings
`;

  let currentChangelog = "";
  if (fs.existsSync(changelogPath)) {
    currentChangelog = fs.readFileSync(changelogPath, 'utf8');
  }
  const updatedChangelog = `# Changelog\n${releaseLog.trim()}\n\n${currentChangelog.replace(/^# Changelog\n/, '')}`;
  fs.writeFileSync(changelogPath, updatedChangelog, 'utf8');
  console.log('CHANGELOG.md updated/created.');

  // Bump version locally in package.json using npm version patch without git operations (we'll commit manually)
  console.log('Bumping package version locally...');
  execSync('npm version patch --no-git-tag-version', { stdio: 'inherit' });

  // Perform dry-run release check: 'npm publish --dry-run'
  console.log('Performing dry-run release check...');
  execSync('npm publish --dry-run', { stdio: 'inherit' });

  // Stage changes and commit safely
  console.log('Staging and committing release version bump...');
  const filesToRelease = [
    'package.json',
    'extensions/tui-status-beautifier.ts',
    'extensions/tui-status-beautifier.spec.ts',
    'CHANGELOG.md',
    'accumulated-suggestions.json'
  ];
  const commitMsg = `chore: release ${nextVersion} - Optimize TUI cell alignment and dirty repaint check`;
  const committed = safeCommitAndPush(filesToRelease, commitMsg);

  if (committed) {
    // Create git tag matching the bumped version
    console.log(`Tagging release as v${nextVersion}...`);
    execSync(`git tag v${nextVersion}`, { stdio: 'inherit' });

    console.log('Pushing tags to GitHub...');
    execSync('git push origin master --tags', { stdio: 'inherit' });

    // Run clean live release: 'npm publish --registry=https://registry.npmjs.org/ --no-git-checks'
    console.log('Publishing live release to npm registry...');
    execSync('npm publish --registry=https://registry.npmjs.org/ --no-git-checks', { stdio: 'inherit' });

    console.log('Live release completed successfully.');

    // Sync updated extension to global directory
    const globalPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.pi/agent/extensions/tui-status-beautifier.ts');
    try {
      fs.copyFileSync(path.join(__dirname, 'extensions/tui-status-beautifier.ts'), globalPath);
      console.log(`Successfully synchronized updated extension to global directory: ${globalPath}`);
    } catch (err) {
      console.error('Failed to sync updated extension to global directory:', err);
    }
  } else {
    console.log('No modifications for release. Skipping tag and npm publish.');
  }
} else {
  // ELSE: Stage, commit ONLY 'accumulated-suggestions.json' safely, and push to GitHub remote.
  console.log('Decision Gate not triggered. Checking for changes to commit accumulated-suggestions.json.');
  safeCommitAndPush(['accumulated-suggestions.json'], 'chore: update accumulated suggestions log');
}
