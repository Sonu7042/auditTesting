import axios from 'axios';
import {env} from '../config/env';
import {storage} from '../storage/storage';
export const api = axios.create({baseURL:env.apiUrl,timeout:30000});
api.interceptors.request.use(async config=>{const token=await storage.token(); if(token) config.headers.Authorization=`Bearer ${token}`; return config});
let onUnauthorized: (()=>void)|undefined;
export const setUnauthorizedHandler=(handler:()=>void)=>{onUnauthorized=handler};
api.interceptors.response.use(r=>r,async error=>{if(error.response?.status===401){await storage.clear();onUnauthorized?.()} const message=error.response?.data?.message||error.response?.data?.error||(error.code==='ERR_NETWORK'?'Unable to connect to the server.':error.message)||'Something went wrong'; return Promise.reject(new Error(message))});
