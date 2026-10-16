const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");

exports.createUser = async (req, res) => {
  try {

    const { fullName, email, username, password, role, companyId, auditTypes } = req.body;
    console.log(req.body)

    // Rule validation
    if (role !== "AUDITOR" && !companyId) {
      return res.status(400).json({
        message: "Company is required for this role"
      });
    }

    const result = await prisma.$transaction(async (tx) => {

      // Create user
      const user = await tx.user.create({
        data: {
          fullName,
          email,
          username,
          password,
          role,
          companyId: role === "AUDITOR" ? null : companyId
        }
      });

      // Only auditors get audit types
      if (role === "AUDITOR" && auditTypes && auditTypes.length > 0) {

        const auditTypeRecords = [];

        for (const auditName of auditTypes) {

          const auditType = await tx.auditType.upsert({
            where: { name: auditName },
            update: {},
            create: { name: auditName }
          });

          auditTypeRecords.push({
            userId: user.id,
            auditTypeId: auditType.id
          });

        }

        await tx.userAuditType.createMany({
          data: auditTypeRecords
        });

      }

      return user;

    });

    res.status(201).json({
      message: "User created successfully",
      user: result
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};

exports.updateUser = async (req, res) => {
  try {

    const { id } = req.params;
    const { fullName, email, username, role, auditTypes, password, companyId } = req.body;


    // check user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (existingUser.role === "ADMIN") {
      return res.status(403).json({
        message: "Admin user cannot be updated"
      });
    }

    await prisma.$transaction(async (tx) => {

      // update user basic info
      await tx.user.update({
        where: { id },
        data: {
          fullName,
          email,
          username,
          role,
          companyId: role === "AUDITOR" ? null : (companyId || existingUser.companyId),
          ...(password?.trim() ? { password } : {}),
        }
      });

      // remove old audit type relations
      await tx.userAuditType.deleteMany({
        where: {
          userId: id
        }
      });

      // insert new audit types
      if (auditTypes && auditTypes.length > 0) {

        const auditTypeRecords = await tx.auditType.findMany({
          where: {
            name: {
              in: auditTypes
            }
          }
        });

        const relations = auditTypeRecords.map(audit => ({
          userId: id,
          auditTypeId: audit.id
        }));

        await tx.userAuditType.createMany({
          data: relations
        });

      }

    });

    res.json({
      message: "User updated successfully"
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};



exports.deleteUser = async (req, res) => {
  try {

    const { id } = req.params;

    // check if user exists
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // prevent admin delete (optional but recommended)
    if (user.role === "ADMIN") {
      return res.status(403).json({
        message: "Admin user cannot be deleted"
      });
    }

    await prisma.user.delete({
      where: { id }
    });

    res.json({
      message: "User deleted successfully"
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};




exports.getUsers = async (req, res) => {
  try {

    const users = await prisma.user.findMany({
      where: {
         role: "AUDITOR"
      },

      select: {
        id: true,
        fullName: true,
        email: true,
        username: true,
        role: true,
        status: true,

        auditTypes: {
          select: {
            auditType: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }

    });
    res.json(users);

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};




exports.deactivateUser = async (req, res) => {

  try {

    const { id } = req.params;

    const user = await prisma.user.update({
      where: { id },
      data: {
        status: false
      }
    });

    res.json({
      message: "User deactivated",
      user
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

};




exports.getUserById = async (req, res) => {
  try {

    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: {
        id
      },

      select: {
        id: true,
        fullName: true,
        email: true,
        username: true,
        role: true,
        status: true,
        password: true,

        auditTypes: {
          select: {
            auditType: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json(user);

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};




exports.getOtherUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: {
          in: [
            "CORPORATE_MANAGER",
            "SITE_INCHARGE",
            "SITE_USER",
            "REGIONAL_MANAGER"
          ]
        }
      },

      select: {
        id: true,
        fullName: true,
        email: true,
        username: true,
        role: true,
        status: true,

        auditTypes: {
          select: {
            auditType: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }

    });

    res.json(users);

  } catch (error) {

    res.status(500).json({
      message: error.message
    });
  }
};

