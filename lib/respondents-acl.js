/**
 * Soft-claim helpers for [Poll] Respondents ACL.
 * UMD: Node tests require() this file; seed:pages can concatenate it ahead of page scripts.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root === 'object') {
    root.PollRespondentsAcl = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RESPONDENTS_GROUP_NAME = '[Poll] Respondents';

  /**
   * True if Session already claimed by a user (no group grant left).
   * @param {Array<{type?: string, level?: string, refId?: string}>} permissionMembers
   */
  function sessionLooksClaimed(permissionMembers) {
    var nonPublic = (permissionMembers || []).filter(function (p) {
      return p && p.type !== 'public' && p.level !== 'mixed';
    });
    var groups = nonPublic.filter(function (p) {
      return p.type === 'group';
    });
    var users = nonPublic.filter(function (p) {
      return p.type === 'user' && p.level === 'write';
    });
    return groups.length === 0 && users.length >= 1;
  }

  /**
   * True if this user already holds exclusive write (claimed by them).
   * @param {Array<{type?: string, level?: string, refId?: string}>} permissionMembers
   * @param {string} userId
   */
  function sessionClaimedByUser(permissionMembers, userId) {
    if (!userId || !sessionLooksClaimed(permissionMembers)) return false;
    var uid = String(userId);
    return (permissionMembers || []).some(function (p) {
      return p && p.type === 'user' && p.level === 'write' && String(p.refId) === uid;
    });
  }

  /**
   * Permissions payload that claims a session for one user (single-id POST replaces).
   * @param {string} userId
   */
  function claimPermissionsPayload(userId) {
    return [{ refId: String(userId), type: 'user', level: 'write' }];
  }

  /**
   * Display label for the sessions table / poll_claimed_by metadata.
   * @param {{username?: string, email?: string, _id?: string}|null|undefined} user
   */
  function claimLabelFromUser(user) {
    if (!user) return '';
    return String(user.username || user.email || user._id || '').trim();
  }

  /**
   * Whether this logged-in user may open a session given stored claim metadata.
   * Empty claimedUserId means not pre-allocated / not yet recorded.
   * @param {string|null|undefined} claimedUserId
   * @param {string|null|undefined} currentUserId
   */
  function sessionAllowsUser(claimedUserId, currentUserId) {
    if (!claimedUserId) return true;
    if (!currentUserId) return false;
    return String(claimedUserId) === String(currentUserId);
  }

  return {
    RESPONDENTS_GROUP_NAME: RESPONDENTS_GROUP_NAME,
    sessionLooksClaimed: sessionLooksClaimed,
    sessionClaimedByUser: sessionClaimedByUser,
    claimPermissionsPayload: claimPermissionsPayload,
    claimLabelFromUser: claimLabelFromUser,
    sessionAllowsUser: sessionAllowsUser,
  };
});
