const axios = require.requireActual('axios');
const { endpoints } = require('../__test__/config');
const boringFlowResp = require('../__test__/assets/flows/boring.json');
const flowsResp = require('../__test__/assets/flows.json');
const groupsResp = require('../__test__/assets/groups.json');
const contactsResp = require('../__test__/assets/contacts.json');
const fieldsResp = require('../__test__/assets/fields.json');
const recipientsResp = require('../__test__/assets/recipients.json');
const labelsResp = require('../__test__/assets/labels.json');

const getEndpoint = (urlStr: string) => {
    const queryIdx = urlStr.indexOf('?');
    const hasQuery = queryIdx > -1;
    return {
        endpoint: hasQuery ? urlStr.slice(0, queryIdx) : urlStr,
        containsQuery: hasQuery ? true : false
    };
};
const containsUUIDQuery = (urlStr: string) => urlStr.indexOf('uuid=') > -1;
const resolvePromise = (data: { [key: string]: any }) => Promise.resolve({ data });
const getUUIDQuery = (urlStr: string) => {
    for (const param of urlStr.split(/\&|\?/)) {
        const [key, value] = param.split('=');
        if (key === 'uuid') {
            return value;
        }
    }
    return null;
};

axios.get = jest.fn(url => {
    const { endpoint, containsQuery } = getEndpoint(url);
    switch (endpoint) {
        case endpoints.flows:
            if (containsQuery && containsUUIDQuery(url)) {
                const uuid = getUUIDQuery(url);
                switch (uuid) {
                    case 'boring':
                        return resolvePromise(boringFlowResp);
                    default:
                        throw new Error(`Axios mock: UUID query "${uuid}" not found`);
                }
            }
            return resolvePromise(flowsResp.assets);
        case endpoints.groups:
            return resolvePromise(groupsResp.assets);
        case endpoints.contacts:
            return resolvePromise(contactsResp.assets);
        case endpoints.fields:
            return resolvePromise(fieldsResp.assets);
        case endpoints.recipients:
            return resolvePromise(recipientsResp);
        case endpoints.labels:
            return resolvePromise(labelsResp.assets);
        default:
            throw new Error('Axios mock: url not passed. Passed: ' + url);
    }
});

module.exports = axios;
