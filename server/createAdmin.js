const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {

  // check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: {
      username: "admin"
     }  
  });

  if (existingAdmin) {
    console.log("Admin already exists"); 
    return; 
  }

  await prisma.user.create({
    data: {
      fullName: "Admin",
      username: "admin",
      email: "admin@gmail.com", 
      password: "admin123",   
      role: "ADMIN" 
    }
  });
  console.log("Admin created successfully");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  