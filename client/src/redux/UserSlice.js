import { createSlice } from "@reduxjs/toolkit";

const usersSlice = createSlice({
  name: "users",
  initialState: {
    users: [],
    loading: false
  },

  reducers: {
    setAllUsers: (state, action) => {
      state.users = action.payload;
    }
  }
});

export const { setAllUsers } = usersSlice.actions;

export default usersSlice.reducer;