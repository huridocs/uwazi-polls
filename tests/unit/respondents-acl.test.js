const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ACL = require('../../lib/respondents-acl.js');

describe('PollRespondentsAcl', () => {
  it('exposes the Respondents group name', () => {
    assert.equal(ACL.RESPONDENTS_GROUP_NAME, '[Poll] Respondents');
  });

  it('sessionLooksClaimed is false when group write remains', () => {
    assert.equal(
      ACL.sessionLooksClaimed([
        { refId: 'g1', type: 'group', level: 'write' },
        { refId: 'u1', type: 'user', level: 'write' },
      ]),
      false
    );
  });

  it('sessionLooksClaimed is true when only user write remains', () => {
    assert.equal(
      ACL.sessionLooksClaimed([{ refId: 'u1', type: 'user', level: 'write' }]),
      true
    );
  });

  it('sessionLooksClaimed ignores public / mixed entries', () => {
    assert.equal(
      ACL.sessionLooksClaimed([
        { type: 'public', level: 'read' },
        { refId: 'u1', type: 'user', level: 'write' },
        { refId: 'u2', type: 'user', level: 'mixed' },
      ]),
      true
    );
  });

  it('sessionClaimedByUser matches the claimer only', () => {
    const perms = [{ refId: 'u1', type: 'user', level: 'write' }];
    assert.equal(ACL.sessionClaimedByUser(perms, 'u1'), true);
    assert.equal(ACL.sessionClaimedByUser(perms, 'u2'), false);
    assert.equal(
      ACL.sessionClaimedByUser(
        [
          { refId: 'g1', type: 'group', level: 'write' },
          { refId: 'u1', type: 'user', level: 'write' },
        ],
        'u1'
      ),
      false
    );
  });

  it('claimPermissionsPayload is a single user write grant', () => {
    assert.deepEqual(ACL.claimPermissionsPayload('abc'), [
      { refId: 'abc', type: 'user', level: 'write' },
    ]);
  });

  it('claimLabelFromUser prefers username then email', () => {
    assert.equal(ACL.claimLabelFromUser({ username: 'ana', email: 'a@x' }), 'ana');
    assert.equal(ACL.claimLabelFromUser({ email: 'a@x' }), 'a@x');
    assert.equal(ACL.claimLabelFromUser(null), '');
  });

  it('sessionAllowsUser blocks a different claimed user', () => {
    assert.equal(ACL.sessionAllowsUser('', 'u1'), true);
    assert.equal(ACL.sessionAllowsUser(null, 'u1'), true);
    assert.equal(ACL.sessionAllowsUser('u1', 'u1'), true);
    assert.equal(ACL.sessionAllowsUser('u1', 'u2'), false);
    assert.equal(ACL.sessionAllowsUser('u1', null), false);
  });
});
