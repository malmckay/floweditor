import axios from 'axios';
import {AxiosResponse} from 'axios';
import {LocationProps, UINode, FlowDefinition} from '../interfaces'

var storage = require('local-storage');

export class Location implements LocationProps {
    x: number
    y: number

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
}

export class UINodeMetaData implements UINode {
    position: Location;
    
    constructor(location: Location) {
        this.position = location;
    }

    setLocation(x: number, y: number) {
        this.position.x = x;
        this.position.y = y;
    }
}


export class FlowStore {

    
    private static singleton: FlowStore = new FlowStore();
    
    static get(): FlowStore {
        return FlowStore.singleton;
    }

    private constructor() {
        console.log('init flow store');

    }

    getFlowFromStore(uuid: string): FlowDefinition {
        return storage.get(uuid) as FlowDefinition;
    }

    loadFromUrl(url: string, token: string, onLoad: Function) {
        return axios.get(url).then((response: AxiosResponse) => {
            var json = eval(response.data);
            let definition = json as FlowDefinition;
            onLoad(definition);
        });
    }

    save(definition: FlowDefinition) {
        storage.set('flow', definition);
    }
}

export default FlowStore;           