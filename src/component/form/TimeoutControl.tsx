import { react as bindCallbacks } from 'auto-bind';
import * as isEqual from 'fast-deep-equal';
import * as React from 'react';
import { connect } from 'react-redux';
import Select, { Option } from 'react-select';
import { bindActionCreators } from 'redux';
import { AppState, UpdateTimeout, updateTimeout } from '../../store';
import { DispatchWithState } from '../../store/thunks';
import { isRealValue, renderIf } from '../../utils';
import * as styles from './TimeoutControl.scss';

export interface TimeoutControlStoreProps {
    checked: boolean;
    timeout: number;
    updateTimeout: UpdateTimeout;
}

export interface TimeoutControlState {
    selected: Option;
}

const TIMEOUT_OPTIONS = [
    { value: 60, label: '1 minutes' },
    { value: 120, label: '2 minutes' },
    { value: 180, label: '3 minutes' },
    { value: 240, label: '4 minutes' },
    { value: 300, label: '5 minutes' },
    { value: 600, label: '10 minutes' },
    { value: 900, label: '15 minutes' },
    { value: 3600, label: '1 hours' },
    { value: 7200, label: '2 hours' },
    { value: 10800, label: '3 hours' },
    { value: 21600, label: '6 hours' },
    { value: 43200, label: '12 hours' },
    { value: 64800, label: '18 hours' },
    { value: 86400, label: '1 days' },
    { value: 172800, label: '2 days' },
    { value: 259200, label: '3 days' },
    // 1 * 7 * 24 * 60 * 60
    { value: 604800, label: '1 week' }
];

const DEFAULT_TIMEOUT = TIMEOUT_OPTIONS[4];

class TimeoutControl extends React.Component<TimeoutControlStoreProps, TimeoutControlState> {
    constructor(props: TimeoutControlStoreProps) {
        super(props);

        this.state = {
            selected: this.getSelected()
        };

        bindCallbacks(this, {
            include: [/^on/, /^handle/]
        });
    }

    private getSelected(): Option<number> {
        for (const [idx, { value }] of TIMEOUT_OPTIONS.entries()) {
            if (value === this.props.timeout) {
                return TIMEOUT_OPTIONS[idx];
            }
        }
        return null;
    }

    private handleCheck(): void {
        if (this.props.checked) {
            this.props.updateTimeout(null);
        } else {
            this.setState(
                {
                    selected: DEFAULT_TIMEOUT
                },
                () => this.props.updateTimeout(DEFAULT_TIMEOUT.value)
            );
        }
    }

    private onChangeTimeout(selected: Option): void {
        if (!isEqual(this.state.selected, selected)) {
            this.setState({ selected }, () => this.props.updateTimeout(selected.value as number));
        }
    }

    private getInstructions(): string {
        const base = 'Continue when there is no response';
        return this.props.checked ? `${base} for` : base;
    }

    public render(): JSX.Element {
        return (
            <div className={styles.timeoutControlContainer}>
                <div className={styles.leftSection}>
                    <input
                        className={styles.checkBox}
                        name="timeout-enabled"
                        type="checkbox"
                        checked={this.props.checked}
                        onChange={this.handleCheck}
                    />
                    {this.getInstructions()}
                </div>
                {renderIf(this.props.checked)(
                    <Select
                        name="timeout"
                        className="select-small-timeout"
                        clearable={false}
                        searchable={false}
                        value={this.state.selected}
                        onChange={this.onChangeTimeout}
                        options={TIMEOUT_OPTIONS}
                    />
                )}
            </div>
        );
    }
}

const mapStateToProps = ({ nodeEditor: { timeout } }: AppState) => ({
    checked: isRealValue(timeout),
    timeout
});

const mapDispatchToProps = (dispatch: DispatchWithState) =>
    bindActionCreators(
        {
            updateTimeout
        },
        dispatch
    );

const ConnectedTimeout = connect(mapStateToProps, mapDispatchToProps)(TimeoutControl);

export default ConnectedTimeout;
