const ensureProjectChecklist = async (db, projectId, checklistType, templateId) => {
  const existingCount = await db.projectChecklistSection.count({
    where: { projectId, checklistType },
  });

  if (existingCount > 0) {
    return;
  }

  const template = await db.checklistTemplate.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        include: {
          questions: {
            orderBy: {
              questionNumber: "asc",
            },
          },
        },
        orderBy: {
          sectionNumber: "asc",
        },
      },
    },
  });

  if (!template) {
    throw new Error("Checklist template not found");
  }

  for (const section of template.sections) {
    await db.projectChecklistSection.create({
      data: {
        projectId,
        checklistType,
        title: section.title,
        mainMenu: section.mainMenu,
        mainMenuNumber: section.mainMenuNumber,
        sectionNumber: section.sectionNumber,
        sourceSectionId: section.id,
        isLocked: section.isLocked,
        questions: {
          create: section.questions.map((question) => ({
            text: question.text,
            dueDateText: question.dueDateText,
            questionNumber: question.questionNumber,
            sourceQuestionId: question.id,
            isLocked: question.isLocked,
          })),
        },
      },
    });
  }
};

const syncTemplateToProjectChecklist = async (db, projectId, checklistType, templateId) => {
  const template = await db.checklistTemplate.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        include: {
          questions: {
            orderBy: {
              questionNumber: "asc",
            },
          },
        },
        orderBy: {
          sectionNumber: "asc",
        },
      },
    },
  });

  if (!template) {
    throw new Error("Checklist template not found");
  }

  for (const section of template.sections) {
    let projectSection = await db.projectChecklistSection.findFirst({
      where: {
        projectId,
        checklistType,
        OR: [
          { sourceSectionId: section.id },
          {
            sourceSectionId: null,
            isCustomized: false,
            sectionNumber: section.sectionNumber,
            mainMenuNumber: section.mainMenuNumber,
          },
        ],
      },
    });

    const sectionData = {
      title: section.title,
      mainMenu: section.mainMenu,
      mainMenuNumber: section.mainMenuNumber,
      sourceSectionId: section.id,
      isLocked: section.isLocked,
    };

    if (projectSection) {
      if (!projectSection.isCustomized) {
        projectSection = await db.projectChecklistSection.update({
          where: { id: projectSection.id },
          data: {
            ...sectionData,
            sectionNumber: projectSection.sectionNumber || section.sectionNumber,
          },
        });
      }
    } else {
      const sectionNumber = await getNextAvailableProjectSectionNumber(
        db,
        projectId,
        checklistType,
        section.mainMenuNumber,
        section.sectionNumber,
      );

      projectSection = await db.projectChecklistSection.create({
        data: {
          projectId,
          checklistType,
          ...sectionData,
          sectionNumber,
        },
      });
    }

    for (const question of section.questions) {
      const projectQuestion = await db.projectChecklistQuestion.findFirst({
        where: {
          sectionId: projectSection.id,
          OR: [
            { sourceQuestionId: question.id },
            {
              sourceQuestionId: null,
              isCustomized: false,
              questionNumber: question.questionNumber,
            },
          ],
        },
      });

      const questionData = {
        text: question.text,
        dueDateText: question.dueDateText,
        sourceQuestionId: question.id,
        isLocked: question.isLocked,
      };

      if (projectQuestion) {
        if (!projectQuestion.isCustomized) {
          await db.projectChecklistQuestion.update({
            where: { id: projectQuestion.id },
            data: {
              ...questionData,
              questionNumber:
                projectQuestion.questionNumber || question.questionNumber,
            },
          });
        }
      } else {
        const questionNumber = await getNextAvailableProjectQuestionNumber(
          db,
          projectSection.id,
          projectSection.sectionNumber,
          question.questionNumber,
        );

        await db.projectChecklistQuestion.create({
          data: {
            sectionId: projectSection.id,
            ...questionData,
            questionNumber,
          },
        });
      }
    }
  }
};

const repairProjectChecklistSourceLinks = async (db, projectId, checklistType, templateId) => {
  const template = await db.checklistTemplate.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        include: {
          questions: true,
        },
      },
    },
  });

  if (!template) {
    throw new Error("Checklist template not found");
  }

  for (const section of template.sections) {
    const projectSection = await db.projectChecklistSection.findFirst({
      where: {
        projectId,
        checklistType,
        OR: [
          { sourceSectionId: section.id },
          {
            sourceSectionId: null,
            isCustomized: false,
            sectionNumber: section.sectionNumber,
            mainMenuNumber: section.mainMenuNumber,
          },
        ],
      },
    });

    if (!projectSection) continue;

    const sectionWasChanged =
      projectSection.title !== section.title ||
      projectSection.mainMenu !== section.mainMenu ||
      projectSection.mainMenuNumber !== section.mainMenuNumber ||
      projectSection.isLocked !== section.isLocked;

    await db.projectChecklistSection.update({
      where: { id: projectSection.id },
      data: {
        sourceSectionId: section.id,
        isCustomized: projectSection.isCustomized || sectionWasChanged,
      },
    });

    for (const question of section.questions) {
      const projectQuestion = await db.projectChecklistQuestion.findFirst({
        where: {
          sectionId: projectSection.id,
          sourceQuestionId: null,
          isCustomized: false,
          questionNumber: question.questionNumber,
        },
      });

      if (!projectQuestion) continue;

      const questionWasChanged =
        projectQuestion.text !== question.text ||
        projectQuestion.dueDateText !== question.dueDateText ||
        projectQuestion.isLocked !== question.isLocked;

      await db.projectChecklistQuestion.update({
        where: { id: projectQuestion.id },
        data: {
          sourceQuestionId: question.id,
          isCustomized: projectQuestion.isCustomized || questionWasChanged,
        },
      });
    }
  }
};

const ensureProjectChecklistForAudit = async (db, auditId) => {
  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      projectId: true,
      checklistType: true,
    },
  });

  if (!audit) {
    throw new Error("Audit not found");
  }

  const existingCount = await db.projectChecklistSection.count({
    where: { projectId: audit.projectId, checklistType: audit.checklistType },
  });

  if (existingCount === 0) {
    await ensureProjectChecklist(db, audit.projectId, audit.checklistType, audit.checklistType);
    return;
  }

  await repairProjectChecklistSourceLinks(
    db,
    audit.projectId,
    audit.checklistType,
    audit.checklistType,
  );
};

const getTemplateProjectTracks = async (db, templateId) => {
  const audits = await db.audit.findMany({
    where: { checklistType: templateId },
    select: { projectId: true, checklistType: true },
    distinct: ["projectId", "checklistType"],
  });

  return audits.map((audit) => ({
    projectId: audit.projectId,
    checklistType: audit.checklistType,
  }));
};

const getNextAvailableProjectSectionNumber = async (
  db,
  projectId,
  checklistType,
  mainMenuNumber,
  preferredNumber,
  excludeSectionId = null,
) => {
  const sections = await db.projectChecklistSection.findMany({
    where: {
      projectId,
      checklistType,
      mainMenuNumber,
      ...(excludeSectionId ? { id: { not: excludeSectionId } } : {}),
    },
    select: { sectionNumber: true },
  });

  const usedNumbers = new Set(
    sections.map((section) => section.sectionNumber).filter(Boolean),
  );

  if (preferredNumber && !usedNumbers.has(preferredNumber)) {
    return preferredNumber;
  }

  const mainNumber = parseInt(mainMenuNumber || preferredNumber || "1", 10);
  const sectionNumbers = sections
    .map((section) => section.sectionNumber)
    .filter(Boolean)
    .map((number) => parseInt(number.split(".")[1], 10))
    .filter((number) => !Number.isNaN(number));

  const next = sectionNumbers.length ? Math.max(...sectionNumbers) + 1 : 1;

  return `${mainNumber}.${String(next).padStart(2, "0")}`;
};

const getNextAvailableProjectQuestionNumber = async (
  db,
  sectionId,
  sectionNumber,
  preferredNumber,
  excludeQuestionId = null,
) => {
  const questions = await db.projectChecklistQuestion.findMany({
    where: {
      sectionId,
      ...(excludeQuestionId ? { id: { not: excludeQuestionId } } : {}),
    },
    select: { questionNumber: true },
  });

  const usedNumbers = new Set(
    questions.map((question) => question.questionNumber).filter(Boolean),
  );

  if (preferredNumber && !usedNumbers.has(preferredNumber)) {
    return preferredNumber;
  }

  const questionNumbers = questions
    .map((question) => question.questionNumber)
    .filter(Boolean)
    .map((number) => parseInt(number.split(".")[2], 10))
    .filter((number) => !Number.isNaN(number));

  const next = questionNumbers.length ? Math.max(...questionNumbers) + 1 : 1;

  return `${sectionNumber}.${String(next).padStart(2, "0")}`;
};

const syncTemplateSectionToProjects = async (db, section) => {
  const tracks = await getTemplateProjectTracks(db, section.templateId);

  for (const { projectId, checklistType } of tracks) {
    const existing = await db.projectChecklistSection.findFirst({
      where: {
        projectId,
        checklistType,
        OR: [
          { sourceSectionId: section.id },
          {
            sourceSectionId: null,
            isCustomized: false,
            sectionNumber: section.sectionNumber,
            mainMenuNumber: section.mainMenuNumber,
          },
        ],
      },
    });

    const data = {
      title: section.title,
      mainMenu: section.mainMenu,
      mainMenuNumber: section.mainMenuNumber,
      sourceSectionId: section.id,
      isLocked: section.isLocked,
    };

    if (existing) {
      if (!existing.isCustomized) {
        await db.projectChecklistSection.update({
          where: { id: existing.id },
          data: {
            ...data,
            sectionNumber: existing.sectionNumber || section.sectionNumber,
          },
        });
      } else if (!existing.sourceSectionId) {
        await db.projectChecklistSection.update({
          where: { id: existing.id },
          data: {
            sourceSectionId: section.id,
          },
        });
      }
    } else {
      const sectionNumber = await getNextAvailableProjectSectionNumber(
        db,
        projectId,
        checklistType,
        section.mainMenuNumber,
        section.sectionNumber,
      );

      await db.projectChecklistSection.create({
        data: {
          projectId,
          checklistType,
          ...data,
          sectionNumber,
        },
      });
    }
  }
};

const syncTemplateQuestionToProjects = async (db, question) => {
  const sourceSection = await db.section.findUnique({
    where: { id: question.sectionId },
  });

  if (!sourceSection) {
    return;
  }

  await syncTemplateSectionToProjects(db, sourceSection);

  const projectSections = await db.projectChecklistSection.findMany({
    where: { sourceSectionId: question.sectionId },
    select: { id: true },
  });

  for (const section of projectSections) {
    const existing = await db.projectChecklistQuestion.findFirst({
      where: {
        sectionId: section.id,
        OR: [
          { sourceQuestionId: question.id },
          {
            sourceQuestionId: null,
            isCustomized: false,
            questionNumber: question.questionNumber,
          },
        ],
      },
    });

    const data = {
      text: question.text,
      dueDateText: question.dueDateText,
      sourceQuestionId: question.id,
      isLocked: question.isLocked,
    };

    if (existing) {
      if (!existing.isCustomized) {
        await db.projectChecklistQuestion.update({
          where: { id: existing.id },
          data: {
            ...data,
            questionNumber: existing.questionNumber || question.questionNumber,
          },
        });
      } else if (!existing.sourceQuestionId) {
        await db.projectChecklistQuestion.update({
          where: { id: existing.id },
          data: {
            sourceQuestionId: question.id,
          },
        });
      }
    } else {
      const projectSection = await db.projectChecklistSection.findUnique({
        where: { id: section.id },
        select: { sectionNumber: true },
      });
      const questionNumber = await getNextAvailableProjectQuestionNumber(
        db,
        section.id,
        projectSection?.sectionNumber || sourceSection.sectionNumber,
        question.questionNumber,
      );

      await db.projectChecklistQuestion.create({
        data: {
          sectionId: section.id,
          ...data,
          questionNumber,
        },
      });
    }
  }
};

const addTemplateSectionToProjects = async (db, section) => {
  const tracks = await getTemplateProjectTracks(db, section.templateId);

  for (const { projectId, checklistType } of tracks) {
    const existing = await db.projectChecklistSection.findFirst({
      where: {
        projectId,
        checklistType,
        OR: [
          { sourceSectionId: section.id },
          {
            sourceSectionId: null,
            isCustomized: false,
            sectionNumber: section.sectionNumber,
            mainMenuNumber: section.mainMenuNumber,
          },
        ],
      },
    });

    if (existing) {
      if (!existing.isCustomized) {
        await db.projectChecklistSection.update({
          where: { id: existing.id },
          data: {
            title: section.title,
            mainMenu: section.mainMenu,
            mainMenuNumber: section.mainMenuNumber,
            sectionNumber: existing.sectionNumber || section.sectionNumber,
            sourceSectionId: section.id,
            isLocked: section.isLocked,
          },
        });
      } else if (!existing.sourceSectionId) {
        await db.projectChecklistSection.update({
          where: { id: existing.id },
          data: {
            sourceSectionId: section.id,
          },
        });
      }

      continue;
    }

    const sectionNumber = await getNextAvailableProjectSectionNumber(
      db,
      projectId,
      checklistType,
      section.mainMenuNumber,
      section.sectionNumber,
    );

    await db.projectChecklistSection.create({
      data: {
        projectId,
        checklistType,
        title: section.title,
        mainMenu: section.mainMenu,
        mainMenuNumber: section.mainMenuNumber,
        sectionNumber,
        sourceSectionId: section.id,
        isLocked: section.isLocked,
      },
    });
  }
};

const addTemplateQuestionToProjects = async (db, question) => {
  const sourceSection = await db.section.findUnique({
    where: { id: question.sectionId },
  });

  if (!sourceSection) {
    return;
  }

  await syncTemplateSectionToProjects(db, sourceSection);

  const projectSections = await db.projectChecklistSection.findMany({
    where: { sourceSectionId: question.sectionId },
    select: { id: true },
  });

  for (const section of projectSections) {
    const existing = await db.projectChecklistQuestion.findFirst({
      where: {
        sectionId: section.id,
        sourceQuestionId: question.id,
      },
    });

    if (existing) {
      if (!existing.isCustomized) {
        await db.projectChecklistQuestion.update({
          where: { id: existing.id },
          data: {
            text: question.text,
            dueDateText: question.dueDateText,
            questionNumber: existing.questionNumber || question.questionNumber,
            sourceQuestionId: question.id,
            isLocked: question.isLocked,
          },
        });
      } else if (!existing.sourceQuestionId) {
        await db.projectChecklistQuestion.update({
          where: { id: existing.id },
          data: {
            sourceQuestionId: question.id,
          },
        });
      }

      continue;
    }

    const projectSection = await db.projectChecklistSection.findUnique({
      where: { id: section.id },
      select: { sectionNumber: true },
    });
    const questionNumber = await getNextAvailableProjectQuestionNumber(
      db,
      section.id,
      projectSection?.sectionNumber || sourceSection.sectionNumber,
      question.questionNumber,
    );

    await db.projectChecklistQuestion.create({
      data: {
        sectionId: section.id,
        text: question.text,
        dueDateText: question.dueDateText,
        questionNumber,
        sourceQuestionId: question.id,
        isLocked: question.isLocked,
      },
    });
  }
};

module.exports = {
  ensureProjectChecklist,
  ensureProjectChecklistForAudit,
  syncTemplateToProjectChecklist,
  repairProjectChecklistSourceLinks,
  syncTemplateSectionToProjects,
  syncTemplateQuestionToProjects,
  addTemplateSectionToProjects,
  addTemplateQuestionToProjects,
};
