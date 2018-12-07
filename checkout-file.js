const vscode = require("vscode");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const gitHelpers = require("./git-helpers");
const promisify = require("./promisify");

function forwardSlashes(str) {
  return str.replace(/\\/g, "/");
}

function normalizePath(str) {
  return forwardSlashes(path.normalize(str));
}

// Note: normalizePath doesn't change drive letter case
// console.assert(normalizePath("c:\\abc") === "c:/abc", normalizePath("c:\\abc"));
// console.assert(normalizePath("C:\\abc") === "C:/abc", normalizePath("C:\\abc"));

function trimWhitespace(str) {
  return str.replace(/^\s+|\s+$/g, "");
}

let gitExePath;

// We'll use this function to run all git commands
async function git(cwd, ...args) {
  if (!gitExePath) {
    gitExePath = gitHelpers.getGitExe();
  }

  const output = await promisify(execFile, gitExePath, args, {
    cwd,
    encoding: "utf8"
  });

  return trimWhitespace(output);
}

// This is the main function used by our extension:
// "uri" is the file that the user right-clicked on.
// This method will not throw. Any exceptions will be shown
// to the user as an error notification.
async function checkoutFile(uri) {
  try {
    // There doesn't seem to be a way to hide a command from the Command Palette.
    if (!uri) {
      await vscode.window.showWarningMessage(
        "Please run git-checkout by right-clicking an item in the file Explorer"
      );
      return;
    }

    // We need to find the target directory in which to run "git rev-parse --show-toplevel"
    // 1. Get a stat for the file/directory that the user right-clicked on.
    // 2. If it's a file, use the directory that holds the file.
    const stat = await promisify(fs.stat, uri.fsPath);
    const targetDirectory = normalizePath(
      stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath)
    );

    // Run git to determine the root of the repo for the target
    // If we're not in a git repo, this wll throw an error and
    // the user will see the error message from git.
    let gitRepoRootDir = normalizePath(
      await git(targetDirectory, "rev-parse", "--show-toplevel")
    );

    // console.log("gitRepoRootDir", gitRepoRootDir);

    // Sanity check: make sure the gitRepoRootDir is actually part of the file/directory
    // that the user selected. Do this check case-insensitively (see note above about
    // normalizePath and drive-letter case)
    if (
      !normalizePath(uri.fsPath)
        .toLowerCase()
        .startsWith(gitRepoRootDir.toLowerCase())
    ) {
      // this should never happen unless I've missed a case in the logic:
      throw Error(
        "BUG: normalized uri.fsPath does not start with gitRepoRootDir"
      );
    }

    // Chop off the git repo root so we can prompt the user with the repo-relative path
    const fileRelPath = normalizePath(uri.fsPath).substring(
      gitRepoRootDir.length + 1
    );
    // console.log("fileRelPath", fileRelPath);

    // Prompt the user (in case they want to check out a file that isn't in the current commit's tree)
    const userInputFileRelPath = await vscode.window.showInputBox({
      prompt:
        "File or directory to check out, relative to the Git repository's root",
      value: fileRelPath,
      ignoreFocusOut: true,

      // TODO: make sure validation runs BEFORE the user has entered something.
      // It appears to only run once the user has altered the input.
      // This might not be necessary. Investigate.
      validateInput(s) {
        if (path.isAbsolute(s)) {
          return "Please enter a relative path";
        }

        if (normalizePath(s) !== s) {
          return "Non-normalized paths are not permitted";
        }
      }
    });

    // User did not input a filename. Abort.
    if (!userInputFileRelPath) return;

    // Prompt the user for the Git commit to check out from
    const commitName = await vscode.window.showInputBox({
      prompt: "Git commit to check out from",
      value: "origin/master",
      ignoreFocusOut: true
    });

    // User hit Esc. Abort.
    if (!commitName) return;

    await git(
      gitRepoRootDir,
      "checkout",
      commitName,
      "--",
      userInputFileRelPath
    );

    // Tell the user that the checkout was a success
    await vscode.window.showInformationMessage(
      'Checked out "' + userInputFileRelPath + '" from ' + commitName
    );
  } catch (e) {
    // console.error("Error checking out file", e);
    vscode.window.showErrorMessage(String(e));
  }
}

module.exports = checkoutFile;
