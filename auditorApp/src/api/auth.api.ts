import {api} from './client'; import {User} from '../types/domain';
export const authApi={async login(username:string,password:string){const {data}=await api.post('/auth/login',{username,password}); return {token:data.token as string,user:(data.user||data.data) as User}}};
