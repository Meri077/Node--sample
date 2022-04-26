/* @flow weak */

var _ = require('lodash');
var _utils = require('../utils');

var DealerUserConfigsApi = {};

DealerUserConfigsApi.updateSendNotificationStatusByUsername = function(username, status, callback) {
    var query = `
        UPDATE ep_dealer_user_configs
        SET notify_on_start_of_rushapp = $1
        WHERE username = $2;
    `;

    var paramList = [
        status,
        username,
    ];

    _utils.parameterizedQuery(query, paramList, function(err) {
        if (err) return callback(err);
        return callback();
    });
};

DealerUserConfigsApi.getByUsername = function(username, callback) {
    var query = 'SELECT * FROM ep_dealer_user_configs WHERE username = $1;';

    _utils.parameterizedQuery(query, [username], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length!=1)) return callback(undefined, undefined);

        return callback(undefined, result.rows[0]);
    });
};


DealerUserConfigsApi.create = function(values, callback) {
    
    var insertValues = _.extend({}, values, {});
    var paramList = _.map(_.range(_.keys(insertValues).length), function (v, i) { return '$'+(i+1); }).join();
    var query     = 'INSERT INTO ep_dealer_user_configs ("' + _.keys(insertValues).join('","') + '") VALUES (' + paramList +') RETURNING id;';

    _utils.parameterizedQuery(query, _.values(insertValues), function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || result.rows.length<=0) return callback('No id returned');

        return callback(undefined, result.rows[0].id);
    });

};


module.exports = DealerUserConfigsApi;
