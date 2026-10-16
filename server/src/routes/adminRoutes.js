const express = require("express");

const router = express.Router();

const {
  createUser,           
  updateUser,    
  deleteUser,    
  deactivateUser,    
  getUsers,
  getUserById,  
  getOtherUsers 
} = require("../controllers/adminController");     

const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

router.post("/create-user", protect, authorize("ADMIN"), createUser);

// router.post("/create-user", protect, authorize("ADMIN"), createUser);

router.put("/update-user/:id", protect, authorize("ADMIN"), updateUser);

router.delete("/delete-user/:id", protect, authorize("ADMIN"), deleteUser);

router.patch("/deactivate-user/:id", protect, authorize("ADMIN"), deactivateUser);

router.get("/users", protect, authorize("ADMIN"), getUsers);

router.get("/get-user/:id", protect, authorize("ADMIN"), getUserById);

router.get("/getOtherUsers", protect, authorize("ADMIN"), getOtherUsers);


module.exports = router;        