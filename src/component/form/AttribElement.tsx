import * as React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import { getTypeConfig, Types } from '../../config/typeConfigs';
import { CreateOptions } from '../../flowTypes';
import { Asset, Assets, AssetType } from '../../services/AssetService';
import { AppState, DispatchWithState, HandleTypeConfigChange, handleTypeConfigChange } from '../../store';
import {
    AssetEntry,
    NodeEditorSettings,
    SetContactAttribFormState,
    SetContactChannelFormState,
    SetContactFieldFormState,
    SetContactLanguageFormState,
    SetContactNameFormState,
} from '../../store/nodeEditor';
import { composeCreateNewOption, getSelectClassForEntry, isOptionUnique, isValidNewOption, snakify } from '../../utils';
import SelectSearch from '../SelectSearch/SelectSearch';
import FormElement, { FormElementProps } from './FormElement';

export interface AttribElementPassedProps extends FormElementProps {
    assets: Assets;
    onChange(selected: Asset): void;

    add?: boolean;
    placeholder?: string;
    searchPromptText?: string;
    helpText?: string;
}

export interface AttribElementStoreProps {
    attribute: AssetEntry;
    settings: NodeEditorSettings;
    handleTypeConfigChange: HandleTypeConfigChange;
}

export type AttribElementProps = AttribElementPassedProps & AttribElementStoreProps;

export const PLACEHOLDER = 'Enter the name of an existing attribute or create a new one';
export const NOT_FOUND = 'Invalid attribute';
export const CREATE_PROMPT = 'New attribute: ';

export const createNewOption = composeCreateNewOption({
    idCb: label => snakify(label),
    type: AssetType.Field
});

export const getNextConfig = (assetType: AssetType) => {
    let nextConfig;

    switch (assetType) {
        case AssetType.Name:
            nextConfig = getTypeConfig(Types.set_contact_name);
            break;
        case AssetType.Field:
            nextConfig = getTypeConfig(Types.set_contact_field);
            break;
        case AssetType.Language:
            nextConfig = getTypeConfig(Types.set_contact_language);
            break;
        case AssetType.Channel:
            nextConfig = getTypeConfig(Types.set_contact_channel);
            break;
    }

    return nextConfig;
};

export class AttribElement extends React.Component<AttribElementProps> {
    public static defaultProps = {
        placeholder: PLACEHOLDER,
        searchPromptText: NOT_FOUND
    };

    constructor(props: any) {
        super(props);

        this.onChange = this.onChange.bind(this);
    }

    private onChange(selected: Asset[]): void {
        const [attribute] = selected;
        const nextConfig = getNextConfig(attribute.type);

        this.props.handleTypeConfigChange(nextConfig, this.props.settings);

        if (this.props.onChange) {
            this.props.onChange(attribute);
        }
    }

    public render(): JSX.Element {
        const createOptions: CreateOptions = {};

        if (this.props.add) {
            createOptions.isValidNewOption = isValidNewOption;
            createOptions.isOptionUnique = isOptionUnique;
            createOptions.createNewOption = createNewOption;
            createOptions.createPrompt = CREATE_PROMPT;
        }

        return (
            <FormElement
                showLabel={this.props.showLabel}
                name={this.props.name}
                helpText={this.props.helpText}
                entry={this.props.attribute}
                // attribError={this.state.errors.length > 0 }
            >
                <SelectSearch
                    __className={getSelectClassForEntry(this.props.entry)}
                    onChange={this.onChange}
                    name={this.props.name}
                    multi={false}
                    assets={this.props.assets}
                    initial={[this.props.attribute.value]}
                    closeOnSelect={true}
                    searchPromptText={this.props.searchPromptText}
                    placeholder={this.props.placeholder}
                    {...createOptions}
                />
            </FormElement>
        );
    }
}

/* istanbul ignore next */
const selectAttribute = (form: SetContactAttribFormState) =>
    (form as SetContactFieldFormState).field ||
    (form as SetContactNameFormState).name ||
    (form as SetContactLanguageFormState).language ||
    (form as SetContactChannelFormState).channel;

/* istanbul ignore next */
const mapStateToProps = ({ nodeEditor: { form, settings } }: AppState) => ({
    attribute: selectAttribute(form as SetContactAttribFormState),
    settings
});

/* istanbul ignore next */
const mapDispatchToProps = (dispatch: DispatchWithState) =>
    bindActionCreators(
        {
            handleTypeConfigChange
        },
        dispatch
    );

const ConnectedAttribElement = connect<
    {},
    {
        handleTypeConfigChange: HandleTypeConfigChange;
    },
    AttribElementPassedProps
>(mapStateToProps, mapDispatchToProps, null, {
    withRef: true
})(AttribElement);

export default ConnectedAttribElement;
