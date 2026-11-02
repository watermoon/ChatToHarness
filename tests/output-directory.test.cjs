'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {outputDirectory}=require('../scripts/output-directory.cjs');
const root=path.resolve(__dirname,'..');

test('all builds use the canonical per-checkout dist directory',()=>{
  assert.equal(outputDirectory(root,{}),path.join(root,'dist'));
  assert.equal(outputDirectory(root,{CTH_DIST_SUBDIR:''}),path.join(root,'dist'));
});

test('feature-specific output directories are rejected',()=>{
  for(const name of ['new-feature','rocket-remote-permission-groups-20261102','0.7.2','..','.', '../outside','nested/name','a\\b','__']) {
    assert.throws(()=>outputDirectory(root,{CTH_DIST_SUBDIR:name}),/CTH_DIST_SUBDIR.*fixed dist/);
  }
});
