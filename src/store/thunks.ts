import * as isEqual from 'fast-deep-equal';
import mutate from 'immutability-helper';
import { Dispatch } from 'react-redux';
import { v4 as generateUUID } from 'uuid';

import { languageToAsset } from '../component/actions/SetContactAttrib/helpers';
import { hasCases } from '../component/NodeEditor/NodeEditor';
import { getTypeConfig, Type, Types } from '../config/typeConfigs';
import {
    Action,
    AnyAction,
    Dimensions,
    Exit,
    FlowDefinition,
    FlowNode,
    FlowPosition,
    SendMsg,
    SetContactField,
    SetRunResult,
    StickyNote,
    SwitchRouter,
    WaitTypes,
} from '../flowTypes';
import AssetService, { Asset } from '../services/AssetService';
import { dedupe, NODE_SPACING, snakify, timeEnd, timeStart } from '../utils';
import { getLanguage } from '../utils/languageMap';
import {
    incrementSuggestedResultNameCount,
    RenderNode,
    RenderNodeMap,
    updateBaseLanguage,
    updateContactFields,
    updateDefinition,
    updateLanguages,
    updateNodes,
    updateResultMap,
} from './flowContext';
import {
    updateCreateNodePosition,
    updateDragSelection,
    updateFetchingFlow,
    updateGhostNode,
    updateLanguage,
    updateNodeDragging,
    updateNodeEditorOpen,
    updatePendingConnection,
    updateTranslating,
} from './flowEditor';
import {
    determineConfigType,
    extractContactFields,
    FlowComponents,
    generateResultQuery,
    getActionIndex,
    getCollision,
    getFlowComponents,
    getGhostNode,
    getLocalizations,
    getSuggestedResultName,
} from './helpers';
import * as mutators from './mutators';
import {
    NodeEditorSettings,
    updateForm,
    updateNodeEditorSettings,
    updateOperand,
    updateResultName,
    updateShowResultName,
    updateTimeout,
    updateTypeConfig,
    updateUserAddingAction,
} from './nodeEditor';
import AppState from './state';

// TODO: Remove use of Function
// tslint:disable:ban-types
export type DispatchWithState = Dispatch<AppState>;

export type GetState = () => AppState;

export type Thunk<T> = (dispatch: DispatchWithState, getState?: GetState) => T;

export type AsyncThunk = Thunk<Promise<void>>;

export type OnAddToNode = (node: FlowNode) => Thunk<void>;

export type HandleTypeConfigChange = (
    typeConfig: Type,
    settings: NodeEditorSettings
) => Thunk<void>;

export type OnResetDragSelection = () => Thunk<void>;

export type OnNodeMoved = (uuid: string, position: FlowPosition) => Thunk<RenderNodeMap>;

export type OnOpenNodeEditor = (settings: NodeEditorSettings) => Thunk<void>;

export type RemoveNode = (nodeToRemove: FlowNode) => Thunk<RenderNodeMap>;

export type UpdateDimensions = (node: FlowNode, dimensions: Dimensions) => Thunk<RenderNodeMap>;

export type FetchFlow = (assetService: AssetService, uuid: string) => Thunk<Promise<void>>;

export type EnsureStartNode = () => Thunk<RenderNode>;

export type NoParamsAC = () => Thunk<void>;

export type UpdateConnection = (source: string, target: string) => Thunk<RenderNodeMap>;

export type OnConnectionDrag = (event: ConnectionEvent) => Thunk<void>;

export type OnUpdateLocalizations = (
    language: string,
    changes: LocalizationUpdates
) => Thunk<FlowDefinition>;

export type UpdateSticky = (stickyUUID: string, sticky: StickyNote) => Thunk<void>;

export type OnUpdateAction = (action: AnyAction) => Thunk<RenderNodeMap>;

export type ActionAC = (nodeUUID: string, action: AnyAction) => Thunk<RenderNodeMap>;

export type DisconnectExit = (nodeUUID: string, exitUUID: string) => Thunk<RenderNodeMap>;

export type HandleLanguageChange = (language: Asset) => Thunk<void>;

export interface ReplaceAction {
    nodeUUID: string;
    actionUUID: string;
}

export type OnUpdateRouter = (node: RenderNode) => Thunk<RenderNodeMap>;

export interface Connection {
    previousConnection: Connection;
}

export interface ConnectionEvent {
    connection: Connection;
    source: Element;
    target: Element;
    sourceId: string;
    targetId: string;
    suspendedElementId: string;
    endpoints: any[];
}

export type LocalizationUpdates = Array<{ uuid: string; translations?: any }>;

const FORCE_FETCH = true;
const QUIET_UI = 10;
const QUIET_SAVE = 1000;
const QUIET_REFLOW = 200;

let debounceReflow: any = null;

export const initializeFlow = (definition: FlowDefinition, assetService: AssetService) => (
    dispatch: DispatchWithState,
    getState: GetState
): FlowComponents => {
    const flowComponents = getFlowComponents(definition);

    if (assetService) {
        assetService.addFlowComponents(flowComponents);
    }

    // Take stock of the flow's language settings
    dispatch(updateBaseLanguage(flowComponents.baseLanguage));
    dispatch(updateLanguage(flowComponents.baseLanguage));

    // store our flow definition without any nodes
    dispatch(updateDefinition(mutators.pruneDefinition(definition)));
    dispatch(updateNodes(flowComponents.renderNodeMap));

    // Take stock of existing results
    dispatch(updateResultMap(flowComponents.resultMap));
    // tslint:disable-next-line:forin
    for (const key in flowComponents.resultMap) {
        dispatch(incrementSuggestedResultNameCount());
    }

    dispatch(updateFetchingFlow(false));
    return flowComponents;
};

export const fetchFlow = (assetService: AssetService, uuid: string) => async (
    dispatch: DispatchWithState,
    getState: GetState
) => {
    dispatch(updateFetchingFlow(true));

    const [flows, environment, fields] = await Promise.all([
        assetService.getFlowAssets().get(uuid),
        assetService.getEnvironmentAssets().get(''),
        assetService.getFieldAssets().get('')
    ]);

    dispatch(initializeFlow(flows.content, assetService));
    dispatch(
        updateLanguages(
            environment.content.languages.map((iso: string) => languageToAsset(getLanguage(iso)))
        )
    );

    const fieldsToDedupe = [...fields.content];
    const existingFields = extractContactFields(flows.content.nodes);
    if (existingFields.length) {
        fieldsToDedupe.push(...existingFields);
    }
    const contactFields = dedupe(fieldsToDedupe).reduce((contactFieldMap, field) => {
        contactFieldMap[field.key] = field.name;
        return contactFieldMap;
    }, {});
    dispatch(updateContactFields(contactFields));
};

export const handleLanguageChange: HandleLanguageChange = language => (dispatch, getState) => {
    const {
        flowContext: { baseLanguage },
        flowEditor: { editorUI: { translating, language: currentLanguage } }
    } = getState();

    // determine translating state
    if (!isEqual(language, baseLanguage)) {
        if (!translating) {
            dispatch(updateTranslating(true));
        }
    } else {
        dispatch(updateTranslating(false));
    }

    // update language
    if (!isEqual(language, currentLanguage)) {
        dispatch(updateLanguage(language));
    }
};

export const reflow = (current: RenderNodeMap = null) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    let nodes = current;
    if (!nodes) {
        nodes = getState().flowContext.nodes;
    }

    const collision = getCollision(nodes);
    if (collision.length) {
        timeStart('reflow');

        const [top, bottom, cascade] = collision;
        let updated = mutators.updatePosition(
            nodes,
            bottom.node.uuid,
            bottom.ui.position.left,
            top.ui.position.bottom + NODE_SPACING
        );

        if (cascade) {
            // start with the top of the bottom node
            let cascadeTop = top.ui.position.bottom + NODE_SPACING;

            // and add its height
            cascadeTop += bottom.ui.position.bottom - bottom.ui.position.top;

            updated = mutators.updatePosition(
                updated,
                cascade.node.uuid,
                cascade.ui.position.left,
                cascadeTop
            );
        }

        timeEnd('reflow');

        updated = dispatch(reflow(updated));
        if (current == null) {
            dispatch(updateNodes(updated));
        }
        return updated;
    }
    return nodes;
};

export const onUpdateLocalizations = (language: string, changes: LocalizationUpdates) => (
    dispatch: DispatchWithState,
    getState: GetState
): FlowDefinition => {
    const { flowContext: { definition } } = getState();
    const updated = mutators.updateLocalization(definition, language, changes);
    dispatch(updateDefinition(updated));
    return updated;
};

export const updateDimensions = (node: FlowNode, dimensions: Dimensions) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    const { flowContext: { nodes } } = getState();
    const updated = mutators.updateDimensions(nodes, node.uuid, dimensions);
    dispatch(updateNodes(updated));
    markReflow(dispatch);
    return updated;
};

/**
 * @param renderNode Adds the given node, uniquifying its uuid
 */
export const addNode = (renderNode: RenderNode) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNode => {
    timeStart('addNode');
    const { flowContext: { nodes } } = getState();
    renderNode.node = mutators.uniquifyNode(renderNode.node);
    dispatch(updateNodes(mutators.mergeNode(nodes, renderNode)));
    timeEnd('addNode');
    return renderNode;
};

export const updateExitDestination = (nodeUUID: string, exitUUID: string, destination: string) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    const { flowContext: { nodes } } = getState();
    const updated = mutators.updateConnection(nodes, nodeUUID, exitUUID, destination);
    dispatch(updateNodes(updated));
    return updated;
};

export const disconnectExit = (nodeUUID: string, exitUUID: string) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => dispatch(updateExitDestination(nodeUUID, exitUUID, null));

export const updateConnection = (source: string, target: string) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    const [nodeUUID, exitUUID] = source.split(':');
    return dispatch(updateExitDestination(nodeUUID, exitUUID, target));
};

export const ensureStartNode = () => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNode => {
    const { flowContext: { nodes } } = getState();

    if (Object.keys(nodes).length === 0) {
        const initialAction: SendMsg = {
            uuid: generateUUID(),
            type: Types.send_msg,
            text: 'Hi there, this is the first message in your flow.'
        };

        const node: FlowNode = {
            uuid: generateUUID(),
            actions: [initialAction],
            exits: [
                {
                    uuid: generateUUID()
                }
            ]
        };

        return dispatch(
            addNode({
                node,
                ui: { position: { left: 120, top: 120 } },
                inboundConnections: {}
            })
        );
    }
};

export const removeNode = (node: FlowNode) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    // Remove result name if node has one
    const { flowContext: { nodes, results: { resultMap } } } = getState();
    if (resultMap.hasOwnProperty(node.uuid)) {
        const toKeep = mutate(resultMap, { $unset: [node.uuid] });
        dispatch(updateResultMap(toKeep));
    }

    const updated = mutators.removeNodeAndRemap(nodes, node.uuid);
    dispatch(updateNodes(updated));
    return updated;
};

export const removeAction = (nodeUUID: string, action: AnyAction) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    const { flowContext: { nodes, results: { resultMap } } } = getState();
    const renderNode = nodes[nodeUUID];

    // Remove result from store
    if (action.type === Types.set_run_result) {
        const toKeep = mutate(resultMap, { $unset: [action.uuid] });
        dispatch(updateResultMap(toKeep));

        // Node invalidation => ...
    }

    /*

    actions[] (
        set_result_name,
        send_msg,
        send_broadcast,
        set_contact_property,
        set_contact_field,
        split_by_expression,
        call_webhook
    )

    router {} result_name

    */

    // If it's our last action, then nuke the node
    if (renderNode.node.actions.length === 1) {
        return dispatch(removeNode(renderNode.node));
    } else {
        // Otherwise, just remove that action
        const updated = mutators.removeAction(nodes, nodeUUID, action.uuid);
        dispatch(updateNodes(updated));
        return updated;
    }
};

export const moveActionUp = (nodeUUID: string, action: AnyAction) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    const { flowContext: { nodes } } = getState();
    const updated = mutators.moveActionUp(nodes, nodeUUID, action.uuid);
    dispatch(updateNodes(updated));
    return updated;
};

/**
 * Splices a router into a list of actions creating up to three nodes where there
 * was once one node.
 * @param nodeUUID the node to replace
 * @param node the new node being added (shares the previous node uuid)
 * @param type the type of the new router
 * @param previousAction the previous action that is being replaced with our router
 * @returns a list of RenderNodes that were created
 */
export const spliceInRouter = (
    newRouterNode: RenderNode,
    previousAction: { nodeUUID: string; actionUUID: string }
) => (dispatch: DispatchWithState, getState: GetState): RenderNodeMap => {
    const { flowContext: { nodes } } = getState();
    const previousNode = nodes[previousAction.nodeUUID];

    newRouterNode.node = mutators.uniquifyNode(newRouterNode.node);

    let updatedNodes = nodes;
    const actionIdx = getActionIndex(previousNode.node, previousAction.actionUUID);

    // we need to splice a wait node where our previousAction was
    const topActions: Action[] =
        actionIdx > 0 ? [...previousNode.node.actions.slice(0, actionIdx)] : [];
    const bottomActions: Action[] = previousNode.node.actions.slice(
        actionIdx + 1,
        previousNode.node.actions.length
    );

    // tslint:disable-next-line:prefer-const
    let { left, top } = previousNode.ui.position;

    let topNode: RenderNode;
    let bottomNode: RenderNode;

    // add our top node if we have one
    if (topActions.length > 0) {
        topNode = {
            node: {
                uuid: generateUUID(),
                actions: topActions,
                exits: [
                    {
                        uuid: generateUUID(),
                        destination_node_uuid: null
                    }
                ]
            },
            ui: { position: { left, top } },
            inboundConnections: { ...previousNode.inboundConnections }
        };

        updatedNodes = mutators.mergeNode(updatedNodes, topNode);
        top += NODE_SPACING;

        // update our routerNode for the presence of a top node
        newRouterNode.inboundConnections = { [topNode.node.exits[0].uuid]: topNode.node.uuid };
        newRouterNode.ui.position.top += NODE_SPACING;
    } else {
        newRouterNode.inboundConnections = { ...previousNode.inboundConnections };
    }

    // now add our routerNode
    updatedNodes = mutators.mergeNode(updatedNodes, newRouterNode);

    // add our bottom
    if (bottomActions.length > 0) {
        bottomNode = {
            node: {
                uuid: generateUUID(),
                actions: bottomActions,
                exits: [
                    {
                        uuid: generateUUID(),
                        destination_node_uuid: previousNode.node.exits[0].destination_node_uuid
                    }
                ]
            },
            ui: {
                position: { left, top }
            },
            inboundConnections: { [newRouterNode.node.exits[0].uuid]: newRouterNode.node.uuid }
        };
        updatedNodes = mutators.mergeNode(updatedNodes, bottomNode);
    } else {
        // if we don't have a bottom, route our routerNode to the previous destination
        updatedNodes = mutators.updateConnection(
            updatedNodes,
            newRouterNode.node.uuid,
            newRouterNode.node.exits[0].uuid,
            previousNode.node.exits[0].destination_node_uuid
        );
    }

    // remove our old node, we have better ones now
    updatedNodes = mutators.removeNode(updatedNodes, previousNode.node.uuid);
    dispatch(updateNodes(updatedNodes));
    return updatedNodes;
};

export const handleTypeConfigChange = (typeConfig: Type, settings: NodeEditorSettings) => (
    dispatch: DispatchWithState,
    getState: GetState
) => {
    // Generate suggested result name if user is changing
    // an existing node to a `wait_for_response` router.
    const { flowContext: { results: { suggestedNameCount } }, nodeEditor } = getState();
    if (
        nodeEditor.settings &&
        nodeEditor.settings.originalNode &&
        (!nodeEditor.settings.originalNode.wait ||
            nodeEditor.settings.originalNode.wait.type !== WaitTypes.msg)
    ) {
        if (typeConfig.type === Types.wait_for_response) {
            dispatch(updateResultName(getSuggestedResultName(suggestedNameCount)));
            dispatch(updateShowResultName(true));
        }
    }

    dispatch(updateTypeConfig(typeConfig));

    // now update our form accordingly
    if (typeConfig.formHelper) {
        // only use the original action if it is the same type
        const customSettings =
            settings.originalAction && settings.originalAction.type === typeConfig.type
                ? settings
                : { ...settings, originalAction: null };
        dispatch(updateForm(typeConfig.formHelper.initializeForm(customSettings, typeConfig.type)));
    }
};

export const resetNodeEditingState = () => (dispatch: DispatchWithState, getState: GetState) => {
    const { flowEditor: { flowUI: { pendingConnection, createNodePosition } } } = getState();

    dispatch(updateGhostNode(null));

    if (pendingConnection) {
        dispatch(updatePendingConnection(null));
    }

    if (createNodePosition) {
        dispatch(updateCreateNodePosition(null));
    }

    dispatch(updateNodeEditorSettings(null));
    dispatch(updateForm(null));
    dispatch(updateTimeout(null));
};

export const onUpdateAction = (action: AnyAction) => (
    dispatch: DispatchWithState,
    getState: GetState
) => {
    timeStart('onUpdateAction');

    const {
        flowEditor: { flowUI: { pendingConnection, createNodePosition } },
        nodeEditor: { userAddingAction, settings },
        flowContext: { nodes, results: { resultMap }, contactFields }
    } = getState();

    if (settings == null || settings.originalNode == null) {
        throw new Error('Need originalNode in settings to update an action');
    }
    const { originalNode, originalAction } = settings;

    let updatedNodes = nodes;
    const creatingNewNode = pendingConnection && pendingConnection.nodeUUID !== originalNode.uuid;

    if (creatingNewNode) {
        const newNode: RenderNode = {
            node: {
                uuid: generateUUID(),
                actions: [action],
                exits: [{ uuid: generateUUID(), destination_node_uuid: null, name: null }]
            },
            ui: { position: createNodePosition },
            inboundConnections: { [pendingConnection.exitUUID]: pendingConnection.nodeUUID }
        };
        updatedNodes = mutators.mergeNode(nodes, newNode);
    } else if (userAddingAction) {
        updatedNodes = mutators.addAction(nodes, originalNode.uuid, action);
    } else if (originalNode.hasOwnProperty('router')) {
        updatedNodes = mutators.spliceInAction(nodes, originalNode.uuid, action);
    } else {
        updatedNodes = mutators.updateAction(nodes, originalNode.uuid, action, originalAction);
    }

    dispatch(updateNodes(updatedNodes));
    dispatch(updateUserAddingAction(false));

    // Add result to store.
    if (action.type === Types.set_run_result) {
        const { name: resultNameOnAction } = action as SetRunResult;
        const newResultMap = {
            ...resultMap,
            // We store results created by a `set_run_result` action
            // with a reference to the action's uuid. A single node may
            // contain one or more `set_run_result` actions, and they
            // may be identical.
            [action.uuid]: `@run.results.${snakify(resultNameOnAction)}`
        };
        dispatch(updateResultMap(newResultMap));
    }

    // Add contact field to our store.
    if (action.type === Types.set_contact_field) {
        const { field } = action as SetContactField;
        dispatch(updateContactFields({ ...contactFields, [field.key]: field.name }));
    }

    timeEnd('onUpdateAction');
    return updatedNodes;
};

/**
 * Opens the NodeEditor in the state for adding to a provided node
 * @param node the node to add to
 */
export const onAddToNode = (node: FlowNode) => (
    dispatch: DispatchWithState,
    getState: GetState
) => {
    const { flowContext: { definition }, flowEditor: { editorUI: { language } } } = getState();

    // TODO: remove the need for this once we all have formHelpers
    const newAction: SendMsg = {
        uuid: generateUUID(),
        type: Types.send_msg,
        text: ''
    };

    const settings: NodeEditorSettings = {
        originalNode: node,
        originalAction: newAction,
        showAdvanced: false
    };

    dispatch(updateUserAddingAction(true));
    dispatch(updateNodeEditorSettings(settings));
    dispatch(handleTypeConfigChange(getTypeConfig(Types.send_msg), settings));
    dispatch(updateNodeDragging(false));
    dispatch(updateNodeEditorOpen(true));
};

export const onNodeEditorClose = (canceled: boolean, connectExit: Function) => (
    dispatch: DispatchWithState,
    getState: GetState
) => {
    const { flowContext: { nodes }, flowEditor: { flowUI: { pendingConnection } } } = getState();

    // Make sure we re-wire the old connection
    if (canceled) {
        if (pendingConnection) {
            const renderNode = nodes[pendingConnection.nodeUUID];
            for (const exit of renderNode.node.exits) {
                /* istanbul ignore else */
                if (exit.uuid === pendingConnection.exitUUID) {
                    connectExit(renderNode.node, exit);
                    break;
                }
            }
        }
    }

    dispatch(resetNodeEditingState());
};

export const onResetDragSelection = () => (dispatch: DispatchWithState, getState: GetState) => {
    const { flowEditor: { flowUI: { dragSelection } } } = getState();

    /* istanbul ignore else */
    if (dragSelection && dragSelection.selected) {
        dispatch(updateDragSelection({ selected: null }));
    }
};

export const onNodeMoved = (nodeUUID: string, position: FlowPosition) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    const { flowContext: { nodes }, flowEditor: { flowUI: { dragSelection } } } = getState();

    if (dragSelection && dragSelection.selected) {
        dispatch(updateDragSelection({ selected: null }));
    }

    const updated = mutators.updatePosition(nodes, nodeUUID, position.left, position.top);
    dispatch(updateNodes(updated));
    markReflow(dispatch);
    return updated;
};

/**
 * Called when a connection begins to be dragged from an endpoint both
 * when a new connection is desired or when an existing one is being moved.
 * @param event
 */
export const onConnectionDrag = (event: ConnectionEvent) => (
    dispatch: DispatchWithState,
    getState: GetState
) => {
    const { flowContext: { nodes, results: { suggestedNameCount } } } = getState();

    // We finished dragging a ghost node, create the spec for our new ghost component
    const [fromNodeUUID, fromExitUUID] = event.sourceId.split(':');

    const fromNode = nodes[fromNodeUUID];
    const ghostNode = getGhostNode(fromNode, suggestedNameCount);

    // Set our ghost spec so it gets rendered.
    dispatch(updateGhostNode(ghostNode));

    // Save off our drag point for later
    dispatch(
        updatePendingConnection({
            nodeUUID: fromNodeUUID,
            exitUUID: event.sourceId.split(':')[1]
        })
    );
};

export const updateSticky = (uuid: string, sticky: StickyNote) => (
    dispatch: DispatchWithState,
    getState: GetState
): void => {
    const { flowContext: { definition } } = getState();
    const updated = mutators.updateStickyNote(definition, uuid, sticky);
    dispatch(updateDefinition(updated));
};

export const onUpdateRouter = (node: RenderNode) => (
    dispatch: DispatchWithState,
    getState: GetState
): RenderNodeMap => {
    const {
        flowContext: { nodes, results: { resultMap } },
        flowEditor: { flowUI: { pendingConnection, createNodePosition } },
        nodeEditor: { settings: { originalNode, originalAction } }
    } = getState();

    const previousNode = nodes[originalNode.uuid];

    let updated = nodes;
    if (createNodePosition) {
        node.ui.position = createNodePosition;
    } else {
        const previousPosition = previousNode.ui.position;
        node.ui.position = previousPosition;
    }

    if (pendingConnection) {
        node.inboundConnections = { [pendingConnection.exitUUID]: pendingConnection.nodeUUID };
        node.node = mutators.uniquifyNode(node.node);
    }

    // update our result names map
    const resultsToUpdate = {
        ...resultMap
    };
    if (node.node.router && node.node.router.result_name) {
        resultsToUpdate[node.node.uuid] = generateResultQuery(node.node.router.result_name);
    } else {
        delete resultsToUpdate[node.node.uuid];
    }
    dispatch(updateResultMap(resultsToUpdate));

    if (originalNode && originalAction && previousNode) {
        const actionToSplice = previousNode.node.actions.find(
            (action: Action) => action.uuid === originalAction.uuid
        );

        if (actionToSplice) {
            // if we are splicing using the original top
            node.ui.position.top = previousNode.ui.position.top;

            return dispatch(
                spliceInRouter(node, {
                    nodeUUID: previousNode.node.uuid,
                    actionUUID: actionToSplice.uuid
                })
            );
        }

        // don't recognize that action, let's add a new router node
        const router = node.node.router as SwitchRouter;
        const exitToUpdate = node.node.exits.find(
            (exit: Exit) => exit.uuid === router.default_exit_uuid
        );

        exitToUpdate.destination_node_uuid = previousNode.node.exits[0].destination_node_uuid;

        node.inboundConnections = { [previousNode.node.exits[0].uuid]: previousNode.node.uuid };
        node.node = mutators.uniquifyNode(node.node);
        node.ui.position.top = previousNode.ui.position.bottom;
        updated = mutators.mergeNode(updated, node);
    } else {
        updated = mutators.mergeNode(updated, node);
    }

    dispatch(updateNodes(updated));

    return updated;
};

/**
 * Debounce for triggered reflows
 */
const markReflow = (dispatch: DispatchWithState) => {
    if (debounceReflow) {
        window.clearTimeout(debounceReflow);
    }

    debounceReflow = window.setTimeout(
        /* istanbul ignore next */ () => {
            dispatch(reflow());
        },
        QUIET_REFLOW
    );
};

export const onOpenNodeEditor = (settings: NodeEditorSettings) => (
    dispatch: DispatchWithState,
    getState: GetState
) => {
    const {
        flowContext: { baseLanguage, nodes, definition: { localization } },
        flowEditor: { editorUI: { language, translating } },
        nodeEditor: { settings: currentSettings }
    } = getState();

    const { originalNode: node } = settings;
    let { originalAction: action } = settings;

    // stuff our localization objects in our settings
    settings.localizations = [];
    if (translating) {
        let actionToTranslate = action;

        // TODO: this is a hack, would be nice to find how to make that area respond differently
        // if they clicked just below the actions, treat it as the last action
        if (!actionToTranslate && node.actions.length > 0) {
            actionToTranslate = node.actions[node.actions.length - 1];
            if (
                actionToTranslate.type !== Types.send_msg &&
                actionToTranslate.type !== Types.send_broadcast
            ) {
                return;
            }
        }

        const translations = localization[language.id];
        settings.localizations.push(
            ...getLocalizations(node, actionToTranslate, language, translations)
        );
    }

    // Account for hybrids or clicking on the empty exit table
    if (!action && node.actions.length > 0) {
        action = node.actions[node.actions.length - 1];
    }

    const type = determineConfigType(node, action, nodes);
    const typeConfig = getTypeConfig(type);

    let resultName = '';

    if (node.router) {
        /* istanbul ignore else */
        if (node.router.result_name) {
            ({ router: { result_name: resultName } } = node);
        }

        /* istanbul ignore else */
        if (node.wait && node.wait.timeout) {
            dispatch(updateTimeout(node.wait.timeout));
        }

        /* istanbul ignore else */
        if (hasCases(node)) {
            const { operand } = node.router as SwitchRouter;
            dispatch(updateOperand(operand));
        }
    }

    dispatch(updateNodeEditorSettings(settings));
    dispatch(handleTypeConfigChange(typeConfig, settings));
    dispatch(updateNodeDragging(false));
    dispatch(updateResultName(resultName));
    dispatch(updateShowResultName(resultName.length > 0));
    dispatch(updateNodeEditorOpen(true));
};
