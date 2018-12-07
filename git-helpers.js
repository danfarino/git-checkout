const vscode = require("vscode");

function getGitExe() {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  const gitApi = gitExt.exports.getAPI(1);
  const gitPath = gitApi.git.path;

  // console.log("gitPath", gitPath);

  return gitPath;
}

module.exports = {
  getGitExe
};
