'use strict';
const path=require('node:path');

// One checkout has one build output root on each device, regardless of feature,
// branch, version, or the caller. Do not create a per-feature dist directory.
// Close the running unpacked app before rebuilding the same output in place.
function outputDirectory(root=path.resolve(__dirname,'..'), env=process.env) {
  if (env.CTH_DIST_SUBDIR !== undefined && env.CTH_DIST_SUBDIR !== '')
    throw new Error('CTH_DIST_SUBDIR is unsupported: builds must use the fixed dist directory');
  return path.join(root,'dist');
}
module.exports={outputDirectory};
