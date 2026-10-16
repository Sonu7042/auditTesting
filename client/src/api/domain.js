import axios from "axios";
import toast from "react-hot-toast";

const devApiHost =
  typeof window !== "undefined" ? window.location.hostname : "localhost";

const domain = 
import.meta.env.VITE_API_URL ||
(import.meta.env.DEV
  ? `http://${devApiHost}:5000/api`
  : "https://audit-testing-bdzn.vercel.app/api");    

const getApiErrorMessage = (error, fallback = "Something went wrong") => {
  const data = error?.response?.data;

  if (typeof data === "string") return data; 
  
  if (data?.message) return data.message;   

  if (data?.error) return data.error;   

  if (error?.message === "Network Error") {  
    return "Unable to connect to the server. Please check your connection.";
  }

  if (error?.message) return error.message;
  return fallback;
};  

const successMethods = new Set(["post", "put", "patch", "delete"]);

const getApiSuccessMessage = (response) => {
  const data = response?.data;

  if (typeof data === "string") return data;
  if (data?.message) return data.message;
  if (data?.successMessage) return data.successMessage;

  return "";
};



axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token && !config.headers?.Authorization) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

axios.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toLowerCase();
    const message = getApiSuccessMessage(response);
    if (
      successMethods.has(method) &&
      message &&
      response.config?.showSuccessToast === true
    ) {
      toast.success(message, { id: `success-${message}` });
    }
    return response;
  },

  (error) => {
    const message = getApiErrorMessage(error);
    error.userMessage = message;
     
    if (error.config?.showErrorToast !== false) {
      toast.error(message, { id: `error-${message}` });
    }


    if (error.response?.status === 401 && localStorage.getItem("token")) {
      localStorage.removeItem("token"); 
      localStorage.removeItem("role"); 
      localStorage.removeItem("user"); 
      localStorage.removeItem("devicePin"); 
      sessionStorage.removeItem("devicePin"); 
      window.dispatchEvent(new Event("auth-expired")); 
    }

    
    return Promise.reject(error);
  },
);

export { getApiErrorMessage, getApiSuccessMessage };
export default domain;
