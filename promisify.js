// Helper function to turn Node.js functions (where the last argument
// is the callback function) into a Promise
function promisify(func, ...args) {
  return new Promise((resolve, reject) => {
    func(...args, (err, ...data) => {
      if (err) {
        reject(err);
      } else {
        resolve(...data);
      }
    });
  });
}

module.exports = promisify;
