/* @flow weak */

var _ = require('lodash');

var _utils = require('../utils');

var DealerUserCacheApi = {};

DealerUserCacheApi.cacheVersion = function() { return 2; };

DealerUserCacheApi.flattenKeycloakUser = function(keycloakUser, roleMappings) {
    var flattened = {};

    flattened.keycloak_id         = keycloakUser.id;
    flattened.raw_user            = JSON.stringify(keycloakUser);
    flattened.raw_roles           = JSON.stringify(roleMappings);
    flattened.time_created        = keycloakUser.createdTimestamp;
    flattened.enabled             = keycloakUser.enabled;
    flattened.username            = keycloakUser.username;
    flattened.email               = keycloakUser.email;
    flattened.first_name          = keycloakUser.firstName;
    flattened.last_name           = keycloakUser.lastName;
    flattened.street_address      = null;
    flattened.apt_suite           = null;
    flattened.city                = null;
    flattened.state               = null;
    flattened.zip                 = null;
    flattened.dealer_code         = null;
    flattened.initials            = null;
    flattened.has_dealer_role     = false;
    flattened.has_employee_role   = false;
    flattened.has_sys_admin_role  = false;
    flattened.has_manager_role    = false;
    flattened.has_credit_role     = false;
    flattened.has_app_review_role = false;
    flattened.has_app_submit_role = false;
    flattened.cache_version       = DealerUserCacheApi.cacheVersion();

    if (keycloakUser.attributes && keycloakUser.attributes.dealer_code && (!_.isEmpty(keycloakUser.attributes.dealer_code))) {
        flattened.dealer_code = keycloakUser.attributes.dealer_code;
    }

    if (keycloakUser.attributes && keycloakUser.attributes.initials && (!_.isEmpty(keycloakUser.attributes.initials))) {
        flattened.initials = keycloakUser.attributes.initials[0];
    }

    if (keycloakUser.attributes && keycloakUser.attributes.phone_number && (!_.isEmpty(keycloakUser.attributes.phone_number))) {
        flattened.phone_number = keycloakUser.attributes.phone_number[0];
    }

    if (keycloakUser.attributes && keycloakUser.attributes.street_address && (!_.isEmpty(keycloakUser.attributes.street_address))) {
        flattened.street_address = keycloakUser.attributes.street_address[0];
    }

    if (keycloakUser.attributes && keycloakUser.attributes.apt_suite && (!_.isEmpty(keycloakUser.attributes.apt_suite))) {
        flattened.apt_suite = keycloakUser.attributes.apt_suite[0];
    }

    if (keycloakUser.attributes && keycloakUser.attributes.city && (!_.isEmpty(keycloakUser.attributes.city))) {
        flattened.city = keycloakUser.attributes.city[0];
    }

    if (keycloakUser.attributes && keycloakUser.attributes.state && (!_.isEmpty(keycloakUser.attributes.state))) {
        flattened.state = keycloakUser.attributes.state[0];
    }

    if (keycloakUser.attributes && keycloakUser.attributes.zip && (!_.isEmpty(keycloakUser.attributes.zip))) {
        flattened.zip = keycloakUser.attributes.zip[0];
    }

    if (keycloakUser.attributes && keycloakUser.attributes.middle_name && (!_.isEmpty(keycloakUser.attributes.middle_name))) {
        flattened.middle_name = keycloakUser.attributes.middle_name[0];
    }

    if (roleMappings.realmMappings) {
        if (_.find(roleMappings.realmMappings, (role) => (role.name === 'Dealer')))               flattened.has_dealer_role    = true;
        if (_.find(roleMappings.realmMappings, (role) => (role.name === 'FCC Employee')))         flattened.has_employee_role  = true;
        if (_.find(roleMappings.realmMappings, (role) => (role.name === 'System Admin')))         flattened.has_sys_admin_role = true;
        if (_.find(roleMappings.realmMappings, (role) => (role.name === 'FCC Manager')))          flattened.has_manager_role   = true;
        if (_.find(roleMappings.realmMappings, (role) => (role.name === 'Credit Reporting')))     flattened.has_credit_role    = true;
        if (_.find(roleMappings.realmMappings, (role) => (role.name === 'Dealer Credit App Review'))) flattened.has_app_review_role = true;
        if (_.find(roleMappings.realmMappings, (role) => (role.name === 'Dealer Credit App Submit'))) flattened.has_app_submit_role = true;
    }

    return flattened;
};

DealerUserCacheApi.getAll = function(callback) {
    var query = `SELECT duc.*, dud.email_type, ud.checked_auth, 
    CASE
    WHEN (ud.street_address is null OR ud.street_address = '') THEN 'No'
    ELSE 'Yes'
    END 
    AS home_address, ll.last_login, ud.state, d.num_apps, e.num_contracts
FROM ep_dealer_user_cache duc 
LEFT OUTER JOIN (select count(ep.*) as num_apps, dd.email from ep_credit_applications ep
                    LEFT OUTER JOIN dp_partial_contracts dp ON ep.partial_id = dp."partialId"
                    LEFT OUTER JOIN dp_user_details dd ON dp.user_uuid = dd.user_uuid
                    where  ep.time_created >= (SELECT extract(epoch from CURRENT_DATE - INTERVAL '3 months') * 1000) 
                    group by dd.email) as d ON d.email = duc.email
LEFT OUTER JOIN (select count(*) as num_contracts, ud.email from dp_loan_contract_submissions dp
        LEFT OUTER JOIN dp_user_details ud ON dp.user_uuid = ud.user_uuid
        where executed = true
        and time_created >= (SELECT extract(epoch from CURRENT_DATE - INTERVAL '3 months') * 1000)  
         group by email) as e ON e.email = duc.email
Left JOIN ep_dealer_emails dud ON duc.email = dud.email
Left OUTER JOIN dp_user_details ud ON duc.email = ud.email
LEFT OUTER JOIN (select keycloak_id, max(timestamp) as last_login from public.authentication_log
where event = 'LOGIN'
group by keycloak_id) ll on duc.keycloak_id = ll.keycloak_id;`;

    _utils.parameterizedQuery(query, [], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length<=0)) return callback(undefined, []);

        return callback(undefined, result.rows);
    });
};

DealerUserCacheApi.getNumberOfCreditApplications = function(uuid, callback) {
    var query = `SELECT count(*) FROM dp_pending_credit_applications 
    WHERE time_created > (SELECT extract(epoch from CURRENT_DATE - INTERVAL '1.5 months') * 1000) 
    AND submission_state = 'submitted'
    AND user_uuid = $1`;

    _utils.parameterizedQuery(query, [uuid], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length<=0)) return callback(undefined, []);

        return callback(undefined, result.rows);
    });
};

// getNumberOfCreditApplications

DealerUserCacheApi.getById = function(id, callback) {
    var query = 'SELECT * FROM ep_dealer_user_cache WHERE id = $1;';

    _utils.parameterizedQuery(query, [id], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length!=1)) return callback(undefined, undefined);

        return callback(undefined, result.rows[0]);
    });
};

DealerUserCacheApi.getDealerStats = function(callback) {
    var query = `
    SELECT distinct
    dc.dealer_code,
    dc.first_name,
    dc.last_name,
    dc.phone_number as phone,
    dc.email,
    dr.product,
    dr.marketing_rep,
    dr.division,
    dr.sub_gap_min_adv_percentage,
    CASE
        WHEN dr.electronic_status_service_plan = 'Basic' THEN 'Basic'
        WHEN dr.electronic_status_service_plan = 'RR Daily' THEN 'Daily'
        WHEN dr.electronic_status_service_plan = 'RR Ult' THEN 'Unlimited'
        ELSE 'Basic'
    END AS electronic_status_service_plan,
    d.num_apps as ezapp_vol_12mo,
    m.last_app_date as recent_ezapp,
    c.num_contracts as ezcont_vol_12mo,
    case when dr.accelerated_verification_request_type in('transaction', 'subscription') then true else false end as avr_toggle,
    edc.enabled,
    case when dr.rushapp_type in('transaction','subscription') then true else false end as rushapp_toggle,
    case when dr.esac_subscription_state = 'active' then true else false end as esac_toggle,
    case when dr.gap_safe_adv_pct > 0 then true else false end as gap_safe_toggle,
    case when dr.gap_safe_adv_pct > 0 then dr.gap_safe_adv_pct else 0 end as gap_safe_value,
    case when dr.gap_lite_advance_percentage > 0 then true else false end gap_lite_toggle,
    case when dr.gap_lite_advance_percentage > 0 then dr.gap_lite_advance_percentage else 0 end as gap_lite_value
    from (select unnest(dealer_code) as dealer_code, duc.email, first_name, last_name, phone_number from ep_dealer_user_cache duc
	JOIN (select email from ep_dealer_emails where email_type = 'primary') as de ON duc.email = de.email) as dc
    LEFT OUTER JOIN ep_dealer_user_cache edc ON dc.email = edc.email
    LEFT OUTER JOIN ep_dealer_record dr ON dc.dealer_code = dr.dealer_code
    LEFT OUTER JOIN (SELECT count(*) as num_apps, dealer_code from
    ( SELECT ep.id as num_apps, ep.dealer_code from ep_credit_applications ep
    where  ep.time_created >= (SELECT extract(epoch from CURRENT_DATE - INTERVAL '12 months') * 1000) ) as sub
    group by dealer_code) as d ON d.dealer_code = dc.dealer_code
    LEFT OUTER JOIN (SELECT count(*) as num_contracts, dealer_code from
    ( SELECT cs.id as num_contracts, cs.dealer_code from dp_loan_contract_submissions cs
    where  cs.time_created >= (SELECT extract(epoch from CURRENT_DATE - INTERVAL '12 months') * 1000)
    AND cs.executed = true
    AND dealer_code notNull) as sub2
    group by dealer_code) as c ON c.dealer_code = dc.dealer_code
    LEFT OUTER JOIN (SELECT max((to_timestamp((time_created) / 1000))) last_app_date, dealer_code from ep_credit_applications
    group by dealer_code) as m ON m.dealer_code = dc.dealer_code
    order by dealer_code
    `;

    _utils.parameterizedQuery(query, [], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length<=0)) return callback(undefined, []);

        return callback(undefined, result.rows);
    });
};

DealerUserCacheApi.delete_user = function(id, callback) {
    var query = 'UPDATE ep_dealer_user_cache set deleted_at=now() WHERE id=$1;';

    _utils.parameterizedQuery(query, [id], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length!=1)) return callback(undefined, undefined);

        return callback(undefined, result.rows);
    });
};

DealerUserCacheApi.update_do_not_text_request_date = function(id, updateData, callback) {
    var query = 'UPDATE ep_dealer_user_cache set do_not_text_request_date=$1 WHERE id=$2;';

    _utils.parameterizedQuery(query, [updateData.do_not_text_request_date, id], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length!=1)) return callback(undefined, undefined);

        return callback(undefined, result.rows);
    });
};

DealerUserCacheApi.getDetailsByKeycloakId = function (keycloakId, callback) {
    var query = `SELECT 
            duc.dealer_code,
            duc.email,
            coalesce(duc.first_name, dud.first_name) as first_name,
            coalesce(duc.last_name, dud.last_name) as last_name,
            coalesce(duc.phone_number, dud.cell_phone) as phone_number,
            has_app_review_role,
            has_app_submit_role
            has_dealer_role,
            has_employee_role,
            has_manager_role,
            has_sys_admin_role
        FROM ep_dealer_user_cache duc
        LEFT JOIN dp_user_details dud ON dud.user_uuid = keycloak_id
        WHERE keycloak_id = $1;`;

    _utils.parameterizedQuery(query, [keycloakId], function (err, result) {
        if (err) return callback(err);

        if ((!result) || (!result.rows) || (result.rows.length != 1)) return callback(undefined, undefined);

        return callback(undefined, result.rows[0]);
    });
};

DealerUserCacheApi.getByKeycloakId = function(keycloakId, callback) {
    var query = 'SELECT * FROM ep_dealer_user_cache WHERE keycloak_id = $1;';

    _utils.parameterizedQuery(query, [keycloakId], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length!=1)) return callback(undefined, undefined);

        return callback(undefined, result.rows[0]);
    });
};

DealerUserCacheApi.getByEmail = function(email, callback) {
    var query = 'SELECT * FROM ep_dealer_user_cache WHERE email = $1;';

    _utils.parameterizedQuery(query, [email], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length!=1)) return callback(undefined, undefined);

        return callback(undefined, result.rows[0]);
    });
};

DealerUserCacheApi.getByUsername = function(username, callback) {
    var query = 'SELECT * FROM ep_dealer_user_cache WHERE username = $1;';

    _utils.parameterizedQuery(query, [username], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length!=1)) return callback(undefined, undefined);

        return callback(undefined, result.rows[0]);
    });
};

DealerUserCacheApi.deleteByKeycloakId = function(keycloakId, callback) {
    var query = 'DELETE FROM ep_dealer_user_cache WHERE keycloak_id = $1;';

    _utils.parameterizedQuery(query, [keycloakId], function(err) {
        if (err) return callback(err);
        return callback();
    });
};

DealerUserCacheApi.removeKeycloakIdSet = function(keycloakIds, callback) {
    var paramList = _.map(_.range(_.keys(keycloakIds).length), function (v, i) { return '$'+(i+1); }).join();
    var query     = 'DELETE FROM ep_dealer_user_cache WHERE keycloak_id IN (' + paramList + ');';

    _utils.parameterizedQuery(query, keycloakIds, function(err) {
        if (err) return callback(err);
        return callback();
    });
};

DealerUserCacheApi.updateByKeycloakId = function(keycloakId, keycloakUser, roleMappings, callback) {
    var rowData = DealerUserCacheApi.flattenKeycloakUser(keycloakUser, roleMappings);
    var fldCnt  = 0;
    var query   = 'UPDATE ep_dealer_user_cache SET ';

    _.each(rowData, function(value, key) { query += ' ' + ((fldCnt === 0) ? '' : ',') + key + ' = $' + ++fldCnt + ' '; });
    query += ' WHERE keycloak_id = $' + ++fldCnt + ';';
    _utils.parameterizedQuery(query, _.values(rowData).concat(keycloakId), function(err) {
        if (err) return callback(err);
        return callback();
    });
};

DealerUserCacheApi.addFromKeycloak = function(keycloakUser, roleMappings, callback) {
    var rowData   = DealerUserCacheApi.flattenKeycloakUser(keycloakUser, roleMappings);
    var paramList = _.map(_.range(_.keys(rowData).length), function (v, i) { return '$'+(i+1); }).join();
    var query     = 'INSERT INTO ep_dealer_user_cache ("' + _.keys(rowData).join('","') + '") VALUES (' + paramList +') RETURNING id;';

    _utils.parameterizedQuery(query, _.values(rowData), function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || result.rows.length<=0) return callback('dealer_portal_api_generic_no_id_returned');

        return callback(undefined, result.rows[0].id);
    });
};

DealerUserCacheApi.updateUserFlags = function(keycloakId, flags, callback) {
    var query = `
        UPDATE ep_dealer_user_cache
        SET email_not_in_ep_dealer_emails = $1, dealer_not_found = $2, dealer_not_eligable = $3
        WHERE keycloak_id = $4;
    `;

    var paramList = [
        flags.email_not_in_ep_dealer_emails ? true : false,
        flags.dealer_not_found ? true : false,
        flags.dealer_not_eligable ? true : false,
        keycloakId,
    ];

    _utils.parameterizedQuery(query, paramList, function(err) {
        if (err) return callback(err);
        return callback();
    });
};

DealerUserCacheApi.getReviewersByDealerCode = function(value, callback) {
    _utils.parameterizedQuery(`SELECT * FROM ep_dealer_user_cache
            WHERE dealer_code @> $1::varchar[]
            AND has_app_review_role = $2
            AND has_app_submit_role = $2
        ;`, [[value], true], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || result.rows.length<=0) return callback(undefined, undefined);
        return callback(undefined, result.rows);
    });
};


DealerUserCacheApi.getDealerWiseSalesReps = function(callback) {


    var query = `SELECT dealer_code, array_agg(username) as sales_reps FROM ep_dealer_user_cache
    WHERE has_dealer_role = true
    AND has_employee_role = false
    AND has_app_review_role = false
    AND has_app_submit_role = false
    AND has_manager_role = false
    GROUP BY dealer_code;`;

    _utils.parameterizedQuery(query, [], function(err, result) {
        if (err) return callback(err);
        if((!result) || (!result.rows) || (result.rows.length<=0)) return callback(undefined, []);
        return callback(undefined, result.rows);
    });
};

DealerUserCacheApi.getUserType = function(user) {
    return new Promise((resolve) => {
        var query = `SELECT email, email_type FROM ep_dealer_emails WHERE email = $1`;
        _utils.parameterizedQuery(query, [user.email], function (err, result) {
            if (err) return resolve("N/A");
            const type = _.get(result, 'rows[0].email_type', '');

            let dealerBasicType = '';
            let userType = 'N/A';
            if (type.includes('primary')) {
                dealerBasicType = 'Primary'; 
            } else if (type.includes('secondary')) {
                dealerBasicType = 'Secondary';
            } else if(type.includes('sales_rep')) {
                userType = 'Sales Rep';
            }

            if (user.has_sys_admin_role) userType = 'System Admin';
            if (user.has_employee_role) userType = 'FCC Employee';
            if (user.has_manager_role) userType = 'FCC Manager';
            if (user.has_dealer_role && !user.has_employee_role) userType = `Dealer ${dealerBasicType}`;
            if (user.has_dealer_role && !user.has_app_review_role ) userType = 'Sales Rep';
            return resolve(userType);
        });
    });
};

DealerUserCacheApi.getSalesReps = function(callback) {
    var query = `SELECT duc.*, dud.email_type, educ.free_rush_app_enabled, educ.normal_rush_app_enabled, ll.last_login
    FROM ep_dealer_user_cache duc 
    Left JOIN ep_dealer_emails dud ON duc.email = dud.email
    Left JOIN ep_dealer_user_configs educ ON duc.email = educ.email
    LEFT OUTER JOIN (select keycloak_id, max(timestamp) as last_login from public.authentication_log
        where event = 'LOGIN'
        group by keycloak_id) ll on duc.keycloak_id = ll.keycloak_id`;

    _utils.parameterizedQuery(query, [], function(err, result) {
        if (err) return callback(err);

        if((!result) || (!result.rows) || (result.rows.length<=0)) return callback(undefined, []);

        return callback(undefined, result.rows);
    });
};


module.exports = DealerUserCacheApi;
