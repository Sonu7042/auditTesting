import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {Audit, Project, User} from '../types/domain';
const SERVICE='com.auditportal.auditor.auth', PIN_SERVICE='com.auditportal.auditor.pin', USER='@auditportal/user', CONTEXT='@auditportal/context';
export const storage = {
 async token(){const v=await Keychain.getGenericPassword({service:SERVICE}); return v ? v.password : null},
 async session(token:string,user:User){await Promise.all([Keychain.setGenericPassword('jwt',token,{service:SERVICE}),AsyncStorage.setItem(USER,JSON.stringify(user))])},
 async hasPin(){return Boolean(await Keychain.getGenericPassword({service:PIN_SERVICE}))},
 async setPin(pin:string){await Keychain.setGenericPassword('device-pin',pin,{service:PIN_SERVICE})},
 async verifyPin(pin:string){const saved=await Keychain.getGenericPassword({service:PIN_SERVICE});return Boolean(saved&&saved.password===pin)},
 async user(){const v=await AsyncStorage.getItem(USER); try{return v?JSON.parse(v) as User:null}catch{return null}},
 async context(){const v=await AsyncStorage.getItem(CONTEXT); try{return v?JSON.parse(v) as {project:Project;audit:Audit}:null}catch{return null}},
 setContext(project:Project,audit:Audit){return AsyncStorage.setItem(CONTEXT,JSON.stringify({project,audit}))},
 clearContext(){return AsyncStorage.removeItem(CONTEXT)},
 async clear(){await Promise.all([Keychain.resetGenericPassword({service:SERVICE}),Keychain.resetGenericPassword({service:PIN_SERVICE}),AsyncStorage.removeMany([USER,CONTEXT])])},
};
