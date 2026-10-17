const prisma = require("../../config/prisma")

exports.createCompany = async (req, res) => {
  try {
    const { companyName, email, address, po_no, logoUrl, contactName, contactPhone } = req.body;

    if (!companyName || !companyName.trim()) {
      return res.status(400).json({
        message: "Company name is required"
      });
    }

    const company = await prisma.company.create({
      data: {
        companyName: companyName.trim(),
        email,
        address,
        po_no,
        logoUrl,
        contactName,
        contactPhone
      }
    });

    res.status(201).json({
      message: "Company created successfully",
      company
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });
  }
};


exports.getCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
            role: true,
            status: true,
            createdAt: true,
            password: true
          }
        }
      }
    });

    res.json(companies);

    console.log(companies)

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};


exports.getCompany = async (req, res) => {
  try {

    const { id } = req.params;

    if (!id) {
      return res.status(404).json({
        message: "companyId not found"
      });
    }

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        users: true
      }
    });

    if (!company) {
      return res.status(404).json({
        message: "Company not found"
      });
    }

    res.json(company);

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};


exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyName, email, address, po_no, logoUrl, contactName, contactPhone } = req.body;

    if (companyName !== undefined && (!companyName || !companyName.trim())) {
      return res.status(400).json({
        message: "Company name is required"
      });
    }

    const company = await prisma.company.update({
      where: { id },
      data: {
        companyName: companyName ? companyName.trim() : undefined,
        email,
        address,
        po_no,
        logoUrl,
        contactName,
        contactPhone
      }
    });
    res.json({
      message: "Company updated successfully",
      company
    });

  } catch (error) {
    res.status(500).json({
      message: error.message
    });

  }
};



exports.deleteCompany = async (req, res) => {
  try {

    const { id } = req.params;

    await prisma.company.delete({
      where: { id }
    });

    res.json({
      message: "Company deleted successfully"
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};


