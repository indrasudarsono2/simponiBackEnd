import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const letterSuffixToNumber = (suffix) => {
  if (!/^[A-Z]+$/.test(suffix)) return null;
  return [...suffix].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
};

const numberToLetterSuffix = (value) => {
  let current = value;
  let suffix = "";

  while (current > 0) {
    current -= 1;
    suffix = String.fromCharCode(65 + (current % 26)) + suffix;
    current = Math.floor(current / 26);
  }

  return suffix;
};

const getNextApplicationNumber = (baseNumber, existingNumbers) => {
  const usedSequenceNumbers = existingNumbers
    .map((existingNumber) => {
      if (existingNumber === baseNumber) return 0;
      if (!existingNumber?.startsWith(baseNumber)) return null;
      return letterSuffixToNumber(existingNumber.slice(baseNumber.length));
    })
    .filter((value) => Number.isInteger(value));

  if (usedSequenceNumbers.length === 0) return baseNumber;

  const nextSequenceNumber = Math.max(...usedSequenceNumbers) + 1;
  return `${baseNumber}${numberToLetterSuffix(nextSequenceNumber)}`;
};

const getApprovedCredential = async (model, id, userNik, label) => {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return { error: `${label} is required.` };
  }

  const validityWhere = label === "IELP"
    ? { OR: [{ expired: { gte: new Date() } }, { level: "6", expired: null }] }
    : { expired: { gte: new Date() } };
  const record = await model.findFirst({
    where: {
      id: parsedId,
      userNik,
      deletedAt: null,
      isConfirmed: true,
      verificationStatus: "APPROVED",
      ...validityWhere,
    },
    select: { id: true },
  });
  return record ? { record } : { error: `Selected ${label} is not approved, has expired, or does not belong to this user.` };
};

const validatePenerbitanRequirements = async (applicantNik, ojtLicenseId, sectorId, branchUnitId) => {
  if (!ojtLicenseId) return "Select an OJTI to receive this PENERBITAN recommendation request.";
  if (!branchUnitId) return "Your branch unit is required to assign an OJTI.";
  const sectorRatings = await prisma.subBranchUnitRating.findMany({
    where: { sectorId, deletedAt: null }, select: { ratingId: true },
  });
  const ratingIds = sectorRatings.map((item) => item.ratingId);
  const [ojti, competences] = await Promise.all([
    prisma.user.findFirst({ where: { licenseUserId: ojtLicenseId, branchUnitId, nik: { not: applicantNik }, deletedAt: null, userRoles: { some: { deletedAt: null, roles: { role: "OPERATIONAL", deletedAt: null } } } }, select: { nik: true } }),
    prisma.competence.findMany({ where: { userId: applicantNik, deletedAt: null, ratingId: { in: ratingIds } }, select: { id: true, file: true } }),
  ]);
  if (!ojti) return "Select another active OPERATIONAL user in your branch unit as OJTI.";
  if (!competences.length || competences.some((item) => !item.file?.trim())) {
    return "Upload a file for each competency certification held before creating a PENERBITAN application.";
  }
  return null;
};

const getApplicationDoc = async (req, res) => {
  // const sect = 8
  const sect = req.user.sectorId
  // const userN = "10077772"
  const userN = req.user.nik
  // const prof = 1
  const prof = req.user.professionId
  try {
    
    const now = dayjs.utc().toDate();

    const firstEvent = await prisma.event.findMany({
      where: {
        deletedAt: null,
        sectorId: sect,
        formFillingDate: {
          gte: now
        },
        eventUsers: {
          some: {
            userNik: userN
          },
        }
      },
      select: {
        id: true,
        event: true,
        remarkDoc: {
          select: {
            remark: true
          }
        },
        startDate: true,
        finishDate: true,
        passingGrade: true,
        practicalPassingGrade: true,
        isPractical: true,
        isSimulator: true,
        eventUsers: {
          where: {
            userNik: userN
          },
          select: {
            id: true,
            userNik: true,
            applicationDocs: {
              where: {
                appRatings: {
                  some: {
                    statusId: {
                      not: 6
                    }
                  }
                }
              },
              select: {
                id: true
              }
            },
            event: {
              select: {
                id: true,
                groups: {
                  where: {
                    groupMembers: {
                      some: {
                        member: userN
                      }
                    }
                  },
                  select: {
                    id: true,
                    group: true,
                    pic: true,
                    checkerGroups: {
                      where: {
                        deletedAt: null,
                      },
                      select: {
                        id: true,
                        userChecker: {
                          where: {
                            deletedAt: null,
                          },
                          select: {
                            nik: true,
                            name: true,
                            userRoles:{
                              where: {
                                deletedAt: null,
                                checkerRatings: {
                                  some: {}
                                }
                              },
                              select: {
                                id: true,
                                checkerRatings: {
                                  where: {
                                    deletedAt: null,
                                  },
                                  select: {
                                    id: true,
                                    rating: {
                                      where: {
                                        deletedAt: null,
                                      },
                                      select: {
                                        id: true,
                                        rating: true
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    groupMembers: {
                      where: {
                        deletedAt:null,
                        member: userN
                      },
                      select: {
                        id: true,
                        member: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })

    const event = firstEvent.filter(e => {
      // Include event when user has no application docs yet (null or empty array).
      return e.eventUsers.some(
        (user) => !user.applicationDocs || user.applicationDocs.length === 0
      );
    });
  
    const applicationDoc = await prisma.applicationDoc.findMany({
      where: {
        deletedAt: null,
        userNik: userN
      },
      include: {
        eventUser: {
          where: {
            deletedAt:null
          },
          include: {
            event: {
              where: {
                deletedAt: null
              },
              include: {
                remarkDoc: true
              }
            }
          }
        },
        medex: true,
        ielp: true,
        ojtUser: { select: { nik: true, name: true, licenseUserId: true } },
        status: true,
        appRatings: {
          where: {
            deletedAt: null
          },
          include: {
            rating: true,
            proposalLetter: { select: { id: true, status: true } },
            practicalTests: {
              select: {
                id: true,
                kindOfPractical: true,
                checkerGroup: {
                  select: {
                    id: true,
                    userChecker: {
                      select: {
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        verifications: {
          include: {
            groupMembers: {
              include: {
                group: {
                  include: {
                    userPic: {
                      select: {
                        nik: true,
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const subBranchRating = await prisma.subBranchUnitRating.findMany({
      where: {
        deletedAt: null,
        sectorId: sect
      },
      select: {
        ratingId: true
      }
    })

    const ratingId = subBranchRating.map(i => i.ratingId);

    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        nik: userN
      },
      include: {
        ielp: {
          where: {
            deletedAt:null
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 6
        },
        medex: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 6
        },
        logbookUsers: {
          where: {
            deletedAt: null
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 6
        },
        license: {
          where: {
            deletedAt: null
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 6
        },
        competences: {
          where: {
            deletedAt: null,
            ratingId: {
              in: ratingId
            }
          },
          include: {
            rating: { select: { id: true, rating: true } }
          }
        },
      }
    })
    
    const rating = await prisma.rating.findMany({
      where: {
        deletedAt: null,
        professionId: prof,
      }
    })

    const getRatingId = subBranchRating.map(i => i.ratingId);

    const competence = await prisma.competence.findMany({
      where: {
        deletedAt: null,
        ratingId: {
          in: getRatingId
        },
        userId: userN
      },
    })
    const getRatingIdFromCompetence = competence.map(c => c.ratingId);
    const ratingReal = rating.filter(r => getRatingIdFromCompetence.includes(r.id));

    const applicationDocWithVerification = applicationDoc.map((doc) => {
      if (!doc.verifications) return doc;

      const { groupMembers, ...verification } = doc.verifications;
      return {
        ...doc,
        verifications: {
          ...verification,
          verifiedBy: groupMembers?.group?.userPic?.name || null,
          verifiedAt: verification.createdAt
        }
      };
    });

    res.json({event, applicationDoc: applicationDocWithVerification, user, rating, competence, ratingReal});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addApplicationDoc = async (req, res) => {
  try {
    const {eventId, groupMemberId, eventUserId, licenseId, logbookUserId, atsName, address, appRating, confirmRating, reason, ratings, location, dateForExpired, confirmOjt, letterNumber, letterDate, controlHour, ojtLicenseId, ojtNik, isDrugs, isFailed, medexId, ielpId } = req.body
    const parsedOjtLicenseId = (ojtLicenseId ?? ojtNik) !== '' ? (ojtLicenseId ?? ojtNik) : null
    const [medexValidation, ielpValidation] = await Promise.all([
      getApprovedCredential(prisma.medex, medexId, req.user.nik, "MEDEX"),
      getApprovedCredential(prisma.ielp, ielpId, req.user.nik, "IELP"),
    ]);
    const credentialError = medexValidation.error || ielpValidation.error;
    if (credentialError) return res.status(422).json({ success: false, message: credentialError });
    
    const eventUser = await prisma.eventUser.findFirst({
      where: {
        id: parseInt(eventUserId),
      },
      select: {
        event: {
          where: {
            groups: {
              some: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              }
            }
          },
          select: {
            id: true,
            remarkDoc: {
              select: {
                remark: true
              }
            },
            sector: { select: { branchUnitId: true } },
            isPractical: true,
            isSimulator: true,
            groups: {
              where: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              },
              select: {
                groupMembers: {
                  where: {
                    member: req.user.nik
                    // member: "10011520"
                  },
                  select: {
                    id: true,
                    member: true
                  }
                },
                checkerGroups: {
                  select: {
                    id: true,
                    checker: true,
                    userChecker: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        name: true,
                        userRoles: {
                          where: {
                            deletedAt: null,
                            checkerRatings: {
                              some: {}
                            }
                          },
                          select: {
                            id: true,
                            checkerRatings: {
                              where: {
                                deletedAt: null,
                              },
                              select: {
                                rating: {
                                  where: {
                                    deletedAt: null
                                  },
                                  select: {
                                    id: true,
                                    rating: true
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        user: {
          select: {
            professionInBranch: {
              select: {
                profession: {
                  select: {
                    profession: true
                  }
                }
              }
            },
            licenseUserId: true
          }
        },
        applicationDocs: {
          select: {
            number: true
          }
        }
      }
    })

    const baseNumber = `${eventUser.user.professionInBranch.profession.profession}/${eventUser.event.remarkDoc.remark}/${eventUser.user.licenseUserId}-${eventUser.event.id}`
    const isPenerbitan = eventUser.event.remarkDoc.remark?.trim().toUpperCase() === "PENERBITAN";
    if (isPenerbitan) {
      if (eventUser.event.sector?.branchUnitId !== req.user.branchUnitId) return res.status(403).json({ message: "The PENERBITAN event is outside your branch unit." });
      const requirementError = await validatePenerbitanRequirements(req.user.nik, parsedOjtLicenseId, req.user.sectorId, req.user.branchUnitId);
      if (requirementError) return res.status(422).json({ message: requirementError });
    }
    const number = getNextApplicationNumber(
      baseNumber,
      eventUser.applicationDocs.map((applicationDoc) => applicationDoc.number),
    )
 
    const appDoc = await prisma.applicationDoc.create({
      data: {
        userNik: req.user.nik,
        // userNik: "10011520",
        number,
        medexId: medexValidation.record.id,
        ielpId: ielpValidation.record.id,
        eventUserId: parseInt(eventUserId),
        licenseId: parseInt(licenseId),
        logbookUserId: parseInt(logbookUserId),
        atsName: atsName !== '' ? atsName : null,
        address: address !== '' ? address : null,
        confirmRating: confirmRating,
        reason: reason !== '' ? reason : null,
        rating: JSON.stringify(ratings),
        location: location !== '' ? location : null,
        dateForExpired: dayjs.utc(dateForExpired).endOf('day').toDate(),
        confirmOjt: isPenerbitan ? false : confirmOjt,
        letterNumber: isPenerbitan ? null : (letterNumber !== '' ? letterNumber : null),
        letterDate: isPenerbitan ? null : (letterDate !== '' ? dayjs.utc(letterDate).startOf('day').toDate() : null),
        ojtRecommendationStatus: isPenerbitan ? "PENDING" : null,
        controlHour: controlHour !== '' ? controlHour : null,
        ojtLicenseId: parsedOjtLicenseId,
        isDrugs: isDrugs,
        isFailed: isFailed,
        statusId: 1,
        appRatings: {
          createMany: {
            data: appRating.map(data => ({ratingId : parseInt(data.rating.id), controlHour: data.controlHour, statusId: 1}))
          },
        }
      }
    })
    
    const appRat = await prisma.appRating.findMany({
      where: {
        deletedAt: null,
        applicationDocId: appDoc.id
      },
      select:{
        id: true,
        ratingId: true
      }
    })

    for(let i in appRat){
      // const find = appRating.find(d => d.rating.id === appRat[i].ratingId)
      const find = appRating.find(d => parseInt(d.rating.id) === appRat[i].ratingId)
    
      if(eventUser.event.isPractical === true && find){
        await prisma.practicalTest.createMany({
          data: find.checkerGroupId.map(d => ({
            groupMemberId: parseInt(groupMemberId),
            checkerGroupId: parseInt(d),
            appRatingId: appRat[i].id,
            kindOfPracticalId: 1
          }))
        })
      }

      if(eventUser.event.isSimulator === true && find){
        await prisma.practicalTest.createMany({
          data: find.checkerGroupId.map(d => ({
            groupMemberId: parseInt(groupMemberId),
            checkerGroupId: parseInt(d),
            appRatingId: appRat[i].id,
            kindOfPracticalId: 2
          }))
        })
      }
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message });
  }
};

const getApplicationDocById = async (req, res) => {
  try {
    const {id} = req.params
    const ownedDocument = await prisma.applicationDoc.findFirst({ where: { id: Number(id), userNik: req.user.nik, deletedAt: null }, select: { id: true, eventUserId: true, ojtLicenseId: true, ojtRecommendationStatus: true, eventUser: { select: { event: { select: { remarkDoc: { select: { remark: true } }, sector: { select: { branchUnitId: true } } } } } }, verifications: { select: { id: true, isValid: true } }, appRatings: { where: { deletedAt: null }, select: { id: true, ratingId: true, proposalLetter: { select: { id: true, status: true } } } } } });
    if (!ownedDocument) return res.status(404).json({ message: "Application document not found." });
    if (ownedDocument.verifications?.isValid) return res.status(409).json({ message: "This application has already been verified by the checker." });
    const hasProposalLetters = ownedDocument.appRatings.some((rating) => rating.proposalLetter);
    const {eventId, eventUserId, licenseId, logbookUserId, atsName, address, appRating, confirmRating, reason, ratings, location, dateForExpired, confirmOjt, letterNumber, letterDate, controlHour, ojtLicenseId, ojtNik, isDrugs, isFailed, medexId, ielpId } = req.body
    const parsedOjtLicenseId = (ojtLicenseId ?? ojtNik) !== '' ? (ojtLicenseId ?? ojtNik) : null
    const existingIsPenerbitan = ownedDocument.eventUser?.event?.remarkDoc?.remark?.trim().toUpperCase() === "PENERBITAN";
    if (existingIsPenerbitan && (ownedDocument.ojtRecommendationStatus === "ACCEPTED" || ownedDocument.appRatings.some((rating) => rating.proposalLetter?.status === "VALIDATED")) && parsedOjtLicenseId !== ownedDocument.ojtLicenseId) {
      return res.status(409).json({ message: "An accepted OJTI recommendation cannot be reassigned." });
    }
    const [medexValidation, ielpValidation] = await Promise.all([
      getApprovedCredential(prisma.medex, medexId, req.user.nik, "MEDEX"),
      getApprovedCredential(prisma.ielp, ielpId, req.user.nik, "IELP"),
    ]);
    const credentialError = medexValidation.error || ielpValidation.error;
    if (credentialError) return res.status(422).json({ success: false, message: credentialError });

    if (hasProposalLetters) {
      if (Number(eventUserId) !== ownedDocument.eventUserId) return res.status(409).json({ message: "An application with proposal letters cannot move to another event." });
      const submittedRatings = Array.isArray(appRating) ? appRating : [];
      const existingIds = ownedDocument.appRatings.map((rating) => rating.ratingId).sort((a, b) => a - b);
      const submittedIds = submittedRatings.map((rating) => Number(rating?.rating?.id)).sort((a, b) => a - b);
      if (!submittedIds.length || new Set(submittedIds).size !== submittedIds.length || submittedIds.some((ratingId, index) => !Number.isInteger(ratingId) || ratingId !== existingIds[index])) {
        return res.status(409).json({ message: "The proposed ratings are locked to their letters. Update the details or hours, but do not add or remove ratings." });
      }
      const [license, logbook] = await Promise.all([
        prisma.license.findFirst({ where: { id: Number(licenseId), userNik: req.user.nik, deletedAt: null, file: { not: null } }, select: { id: true } }),
        prisma.logBookUser.findFirst({ where: { id: Number(logbookUserId), userNik: req.user.nik, deletedAt: null, file: { not: null } }, select: { id: true } }),
      ]);
      if (!license || !logbook) return res.status(422).json({ message: "Select your own license and logbook with uploaded files." });
      if (existingIsPenerbitan) {
        if (ownedDocument.eventUser?.event?.sector?.branchUnitId !== req.user.branchUnitId) return res.status(403).json({ message: "The PENERBITAN event is outside your branch unit." });
        const requirementError = await validatePenerbitanRequirements(req.user.nik, parsedOjtLicenseId, req.user.sectorId, req.user.branchUnitId);
        if (requirementError) return res.status(422).json({ message: requirementError });
      }
      const ratingById = new Map(ownedDocument.appRatings.map((rating) => [rating.ratingId, rating]));
      await prisma.$transaction(async (tx) => {
        await tx.applicationDoc.update({ where: { id: Number(id) }, data: {
          medexId: medexValidation.record.id,
          ielpId: ielpValidation.record.id,
          licenseId: license.id,
          logbookUserId: logbook.id,
          atsName: atsName || null,
          address: address || null,
          confirmRating,
          reason: reason || null,
          location: location || null,
          dateForExpired: dateForExpired ? dayjs.utc(dateForExpired).endOf('day').toDate() : null,
          ...(!existingIsPenerbitan && { confirmOjt, letterNumber: letterNumber || null, letterDate: letterDate ? dayjs.utc(letterDate).startOf('day').toDate() : null }),
          controlHour: controlHour || null,
          ojtLicenseId: parsedOjtLicenseId,
          isDrugs,
          isFailed,
          rating: Array.isArray(ratings) && ratings.length ? JSON.stringify(ratings) : null,
        } });
        for (const submitted of submittedRatings) {
          const existing = ratingById.get(Number(submitted.rating.id));
          await tx.appRating.update({ where: { id: existing.id }, data: { controlHour: String(submitted.controlHour ?? '') } });
        }
      });
      return res.status(200).json({ success: true, message: "Application updated. Validated letters remain unchanged as audit snapshots." });
    }

    const eventUser = await prisma.eventUser.findFirst({
      where: {
        id: parseInt(eventUserId),
      },
      select: {
        event: {
          where: {
            groups: {
              some: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              }
            }
          },
          select: {
            id: true,
            remarkDoc: {
              select: {
                remark: true
              }
            },
            sector: { select: { branchUnitId: true } },
            isPractical: true,
            isSimulator: true,
            groups: {
              where: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              },
              select: {
                groupMembers: {
                  where: {
                    member: req.user.nik
                    // member: "10011520"
                  },
                  select: {
                    id: true,
                    member: true
                  }
                },
                checkerGroups: {
                  select: {
                    id: true,
                    checker: true
                  }
                }
              }
            }
          }
        },
        user: {
          select: {
            professionInBranch: {
              select: {
                profession: {
                  select: {
                    profession: true
                  }
                }
              }
            },
            licenseUserId: true
          }
        }
      }
    })

    const groupMember = eventUser.event.groups[0].groupMembers
    const isPenerbitan = eventUser.event.remarkDoc.remark?.trim().toUpperCase() === "PENERBITAN";
    if (isPenerbitan) {
      if (eventUser.event.sector?.branchUnitId !== req.user.branchUnitId) return res.status(403).json({ message: "The PENERBITAN event is outside your branch unit." });
      const requirementError = await validatePenerbitanRequirements(req.user.nik, parsedOjtLicenseId, req.user.sectorId, req.user.branchUnitId);
      if (requirementError) return res.status(422).json({ message: requirementError });
    }
    const checkerGroup = eventUser.event.groups[0].checkerGroups 
    
    const data = {
      medexId: medexValidation.record.id,
      ielpId: ielpValidation.record.id,
      licenseId: parseInt(licenseId),
      logbookUserId: parseInt(logbookUserId),
      atsName: atsName !== '' ? atsName : null,
      address: address !== '' ? address : null,
      confirmRating: confirmRating,
      reason: reason !== '' ? reason : null,
      location: location !== '' ? location : null,
      dateForExpired: dayjs.utc(dateForExpired).endOf('day').toDate(),
      ...(isPenerbitan
        ? { confirmOjt: ownedDocument.ojtRecommendationStatus === "ACCEPTED", ojtRecommendationStatus: ownedDocument.ojtRecommendationStatus === "ACCEPTED" ? "ACCEPTED" : "PENDING" }
        : { confirmOjt, letterNumber: letterNumber !== '' ? letterNumber : null, letterDate: letterDate !== '' ? dayjs.utc(letterDate).startOf('day').toDate() : null }),
      controlHour: controlHour !== '' ? controlHour : null,
      ojtLicenseId: parsedOjtLicenseId,
      isDrugs: isDrugs,
      isFailed: isFailed,
      statusId: 1,
      appRatings: {
        deleteMany: {},
        createMany: {
          data: appRating.map(data => ({ratingId : parseInt(data.rating.id), controlHour: data.controlHour, statusId: 1}))
        },
      }
    }

    if(ratings.length !== 0){
      data.rating = JSON.stringify(ratings)
    }

    const appDoc = await prisma.applicationDoc.update({
      where: {
        id: parseInt(id)
      },
      data
    })

    const appRat = await prisma.appRating.findMany({
      where: {
        deletedAt: null,
        applicationDocId: appDoc.id
      },
      select:{
        id: true
      }
    })

    for(let i in appRat){
      if(eventUser.event.isPractical === true){
        await prisma.practicalTest.createMany({
          data: checkerGroup.map(d => ({
            groupMemberId: groupMember[0].id,
            checkerGroupId: d.id,
            appRatingId: appRat[i].id,
            kindOfPracticalId: 1
          }))
        })
      }

      if(eventUser.event.isSimulator === true){
        await prisma.practicalTest.createMany({
          data: checkerGroup.map(d => ({
            groupMemberId: groupMember[0].id,
            checkerGroupId: d.id,
            appRatingId: appRat[i].id,
            kindOfPracticalId: 2
          }))
        })
      }
    }

    res.status(201).json({ success: true}); 
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message });
  }
};

const deleteApplicationDoc = async (req, res) => {
  try {
    const now = dayjs.utc().toDate();
    const { id } = req.params;
    const ownedDocument = await prisma.applicationDoc.findFirst({ where: { id: Number(id), userNik: req.user.nik, deletedAt: null }, select: { id: true } });
    if (!ownedDocument) return res.status(404).json({ message: "Application document not found." });
    const existingLetter = await prisma.proposalLetter.findFirst({ where: { applicationDocId: Number(id) }, select: { id: true } });
    if (existingLetter) return res.status(409).json({ message: "This application has proposal-letter audit history and cannot be deleted." });
  
    await prisma.applicationDoc.update({
      where: { id: parseInt(id) },
        data: { 
          deletedAt: now,
        }
      });

    res.status(201).json({ success: true,});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

export { getApplicationDoc, addApplicationDoc, getApplicationDocById, deleteApplicationDoc};
