/* @flow weak */

var _ = require('lodash');

var _utils = require('./utils');

var restMethods = require('./attachRestApiMethods');

var dealerUserCacheApi                = require('./api/dealerUserCache');
var ssoUsersApi                       = require('./api/ssoUsers');
var _keycloak_JobApi_v1               = require('./keycloak_JobApi_v1');
var dpCacheTermsOfUseApi              = require('./api/dpCacheTermsOfUse');
var dpCacheTermsOfUseAcceptanceApi    = require('./api/dpCacheTermsOfUseAcceptance');
var dpCachePrivacyPolicyApi           = require('./api/dpCachePrivacyPolicy');
var dpCachePrivacyPolicyAcceptanceApi = require('./api/dpCachePrivacyPolicyAcceptance');

exports.dealer_user_cache = function(app, path, ...middleWare) {
    restMethods.selected('lg', app, path, 'ep_dealer_user_cache',[
        { name : 'raw_user',             type : 'string', allowNull : false },
        { name : 'raw_roles',            type : 'string', allowNull : false },
        { name : 'keycloak_id',          type : 'string', allowNull : false },
        { name : 'enabled',              type : 'bool',   allowNull : false },
        { name : 'dealer_code',          type : 'array',  allowNull : true  },
        { name : 'initials',             type : 'string', allowNull : true  },
        { name : 'phone_numbrer',        type : 'string', allowNull : true  },
        { name : 'username',             type : 'string', allowNull : false },
        { name : 'email',                type : 'string', allowNull : false },
        { name : 'first_name',           type : 'string', allowNull : false },
        { name : 'last_name',            type : 'string', allowNull : false },
        { name : 'street_address',       type : 'string', allowNull : true  },
        { name : 'apt_suite',            type : 'string', allowNull : true  },
        { name : 'city',                 type : 'string', allowNull : true  },
        { name : 'state',                type : 'string', allowNull : true  },
        { name : 'zip',                  type : 'string', allowNull : true  },
        { name : 'middle_name',          type : 'string', allowNull : true  },
        { name : 'last_name',            type : 'string', allowNull : false },
        { name : 'has_dealer_role',      type : 'bool',   allowNull : false },
        { name : 'time_created',         type : 'time',   allowNull : false },
    ], undefined, ...middleWare);

    app.get(path + '/:id/terms_up_to_date', ...middleWare, function (req, res) {
        dealerUserCacheApi.getById(req.params.id, function(err, userCache) {
            if (err) return res.status(404).send('User Cache not Found');

            dpCacheTermsOfUseApi.getLatest(function(err, latest) {
                if (err) return res.status(404).send('Cache not Found');

                if (_.isEmpty(latest)) return res.send('Accepted');

                dpCacheTermsOfUseAcceptanceApi.getIsAccepted(latest.terms_uuid, userCache.keycloak_id, (err, result) => {
                    if (err) return res.status(404).send('Acceptance Cache not Found');

                    return res.send(result ? 'Accepted' : 'Not Accepted');
                });
            });
        });
    });

    app.get(path + '/:id/policy_up_to_date', ...middleWare, function (req, res) {
        dealerUserCacheApi.getById(req.params.id, function(err, userCache) {
            if (err) return res.status(404).send('User Cache not Found');

            dpCachePrivacyPolicyApi.getLatest(function(err, latest) {
                if (err) return res.status(404).send('Cache not Found');

                if (_.isEmpty(latest)) return res.send('Accepted');

                dpCachePrivacyPolicyAcceptanceApi.getIsAccepted(latest.privacy_policy_uuid, userCache.keycloak_id, (err, result) => {
                    if (err) return res.status(404).send('Acceptance Cache not Found');

                    return res.send(result ? 'Accepted' : 'Not Accepted');
                });
            });
        });
    });

    app.post(path + '/:id/change_data', ...middleWare, app._hasRole.manager, function (req, res) { //NOTE: this is specifically set higher to manager and not employee
        dealerUserCacheApi.getById(req.params.id, function(err, userCache) {
            if (err) return res.status(404).send('User Cache not Found');

            const isEmployee = !!userCache.has_employee_role;

            if (req && req.body && req.body.user) {
                if (userCache.has_employee_role && (!_.includes(req.body.user.drop_roles, 'FCC Employee'))) {
                    if (_.includes(req.body.user.drop_roles, 'Dealer Credit App Review')) {
                        return res.status(400).send('Cannot remove review role for employee user');
                    }
                    if (_.includes(req.body.user.drop_roles, 'Dealer Credit App Submit')) {
                        return res.status(400).send('Cannot remove submit role for employee user');
                    }
                }
                if ((_.includes(req.body.user.add_roles, 'FCC Employee'))) {
                    if ((!userCache.has_app_review_role) && (!_.includes(req.body.user.add_roles, 'Dealer Credit App Review'))) {
                        return res.status(400).send('Cannot remove review role for employee user');
                    }
                    if ((!userCache.has_app_submit_role) && (!_.includes(req.body.user.add_roles, 'Dealer Credit App Submit'))) {
                        return res.status(400).send('Cannot remove submit role for employee user');
                    }
                }
            }

            _utils.processTransaction( function (trans) {
                return _keycloak_JobApi_v1.add_update_sso_user_data(trans, userCache.keycloak_id, req.body, isEmployee);
            }).then(function() { res.send('Ok'); }).catch(function(err) { res.status(500).send(err); });
        });
    });

    app.post(path + '/:id/reset_password', ...middleWare, app._hasRole.manager, function (req, res) { //NOTE: this is specifically set higher to manager and not employee
        dealerUserCacheApi.getById(req.params.id, function(err, userCache) {
            if (err) return res.status(404).send('User Cache not Found');

            ssoUsersApi.resetUserPassword({
                keycloakId : userCache.keycloak_id,
                password   : req.body.password,
                temporary  : req.body.temporary,
            }, function(err, result) {
                if (err) return res.status(err.code || 500).send(err);
                return res.send(result);
            });
        });
    });

    app.post(path + '/:id/require_password_reset', ...middleWare, app._hasRole.manager, function (req, res) { //NOTE: this is specifically set higher to manager and not employee
        dealerUserCacheApi.getById(req.params.id, function(err, userCache) {
            if (err) return res.status(404).send('User Cache not Found');

            ssoUsersApi.setRequiredActionsAndEmail({
                keycloakId      : userCache.keycloak_id,
                requiredActions : ['UPDATE_PASSWORD'],
            }, function(err, result) {
                if (err) return res.status(err.code || 500).send(err);
                return res.send(result);
            });
        });
    });

    app.post(path, ...middleWare, app._hasRole.manager, function (req, res) { //NOTE: this is specifically set higher to manager and not employee
        ssoUsersApi.createDealerUser(req.body, function(err, result) {
            if (err) return res.status(err.code || 500).send(err);
            return res.status(200).send({ result : result });
        });
    });
};

exports.attach = function(app, path, ...middleWare) {
    exports.dealer_user_cache(app, path + '/dealer_user_cache', ...middleWare);
};
