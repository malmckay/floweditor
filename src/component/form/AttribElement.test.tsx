import { getTypeConfig } from '../../config';
import { Types } from '../../config/typeConfigs';
import { Asset, AssetType } from '../../services/AssetService';
import { composeComponentTestUtils, configProviderContext, setMock } from '../../testUtils';
import { createExit, createSendMsgAction, createSetContactFieldAction } from '../../testUtils/assetCreators';
import { isOptionUnique, isValidNewOption } from '../../utils';
import { fieldToAsset, propertyToAsset } from '../actions/SetContactAttrib/helpers';
import { AttribElement, AttribElementProps, CREATE_PROMPT, createNewOption } from './AttribElement';

const attribute: Asset = {
    id: 'name',
    name: 'Name',
    type: AssetType.Name
};

const originalAction = createSendMsgAction();

const originalNode = {
    uuid: 'original-node-0',
    actions: [originalAction],
    exits: [createExit()]
};

const baseProps: AttribElementProps = {
    name: 'Attribute',
    attribute: { value: attribute },
    typeConfig: getTypeConfig(Types.set_contact_name),
    assets: configProviderContext.assetService.getFieldAssets(),
    settings: { originalAction, originalNode },
    handleTypeConfigChange: jest.fn(),
    onChange: jest.fn()
};

const { setup, spyOn } = composeComponentTestUtils(AttribElement, baseProps);

describe(AttribElement.name, () => {
    describe('helpers', () => {
        describe('createNewOption', () => {
            it('should return a new SearchResult', () => {
                const newOption = { label: 'Home Phone', labelKey: 'name', valueKey: 'id' };

                expect(createNewOption(newOption)).toEqual({
                    id: 'home_phone',
                    name: newOption.label,
                    type: AssetType.Field,
                    isNew: true
                });
            });
        });
    });

    describe('render', () => {
        it('should pass createOptions to SelectSearch', () => {
            const { wrapper } = setup(true, { add: { $set: true } });

            expect(wrapper.find('SelectSearch').props()).toEqual(
                expect.objectContaining({
                    isValidNewOption,
                    isOptionUnique,
                    createNewOption,
                    createPrompt: CREATE_PROMPT
                })
            );
            expect(wrapper).toMatchSnapshot();
        });
    });

    describe('instance methods', () => {
        describe('onChange', () => {
            it('should update type config if passed an contact name asset', () => {
                const { wrapper, instance, props } = setup(true, {
                    handleTypeConfigChange: setMock()
                });

                instance.onChange([props.attribute.value]);

                expect(props.handleTypeConfigChange).toHaveBeenCalledTimes(1);
                expect(props.handleTypeConfigChange).toHaveBeenCalledWith(
                    getTypeConfig(Types.set_contact_name),
                    props.settings
                );
            });

            it('should update type config if passed an contact field asset', () => {
                const { wrapper, instance, props } = setup(true, {
                    handleTypeConfigChange: setMock()
                });
                const existingField: Asset = {
                    id: 'field-0',
                    name: 'National ID',
                    type: AssetType.Field
                };

                instance.onChange([existingField]);

                expect(props.handleTypeConfigChange).toHaveBeenCalledTimes(1);
                expect(props.handleTypeConfigChange).toHaveBeenCalledWith(
                    getTypeConfig(Types.set_contact_field),
                    props.settings
                );
            });

            it('should call onChange handler if passed', () => {
                const { wrapper, instance, props } = setup(true, { onChange: setMock() });

                instance.onChange([props.attribute]);

                expect(props.onChange).toHaveBeenCalledTimes(1);
                expect(props.onChange).toHaveBeenCalledWith(props.attribute);
            });

            it('should update typeConfig', () => {
                const setContactFieldAsset = fieldToAsset(createSetContactFieldAction().field);
                const { wrapper, instance, props } = setup(false, {
                    initial: { $set: setContactFieldAsset },
                    handleTypeConfigChange: setMock()
                });
                const setContactPropertyAsset = propertyToAsset(Types.set_contact_name);

                instance.onChange([setContactPropertyAsset]);

                expect(props.handleTypeConfigChange).toHaveBeenCalledTimes(1);
                expect(props.handleTypeConfigChange).toHaveBeenCalledWith(
                    getTypeConfig(Types.set_contact_name),
                    props.settings
                );
            });
        });
    });
});
