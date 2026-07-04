import 'dotenv/config';
import fs from 'fs';
import prisma from './lib/prisma.js';
import dayjs from 'dayjs';
import utc from "dayjs/plugin/utc.js"
dayjs.extend(utc);
const OUTPUT_FILE = 'tes-output1.json';

async function main() {
  try {
    // ============================================================
    // EDIT YOUR DEBUG QUERY BELOW
    // ============================================================
    // Example: fetch a handful of DutyReport rows with key relations.
    // Swap it for any other Prisma query you need to debug.
    const reqUserBranchUnitId = 17
    const shiftDate = "2026-06-26"
    const dailyReport = await prisma.dutyReport.findMany({
      where: {
        deletedAt: null,
        spv: {
          branchUnitId:reqUserBranchUnitId
        },
        shiftDate: dayjs.utc(shiftDate).toDate()
      },
      select: {
        id: true,
        onGoingIssue: true,
        others: true,
        spv: {
          select: {
            name: true
          }
        },
        supervisorCwp: {
          select: {
            id: true,
            supervisor: true,
            cwpSupervisors: {
              select: {
                id: true,
                cwp: {
                  select: {
                    id: true,
                    cwp: true,
                    rating: {
                      select: {
                        rating: true
                      }
                    },
                    cwpFrequencies: {
                      select: {
                        id: true,
                        frequency: true,
                        isPrimary: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        shiftName: {
          select: {
            id: true,
            shift: true,
            shifts: {
              select: {
                id: true,
                start: true,
                end: true,
                duration: true,
                isControl: true
              }
            }
          }
        },
        statusFrequencies: {
          select: {
            id: true,
            statusFreq: {
              select: {
                status: true
              }
            },
            remark: true,
            cwpFrequencyId: true,
            cwpFrequency: {
              select: {
                id: true,
                frequency: true,
                isPrimary: true,
                cwp: {
                  select: {
                    id: true,
                    cwp: true
                  }
                }
              }
            }
          }
        },
        logBooks: {
          select: {
            id: true,
            user: {
              select: {
                name: true
              }
            },
            supervisorLogBook:{
              select: {
                name: true
              }
            },
            shift: {
              select: {
                id: true,
                shiftName: {
                  select: {
                    shift: true
                  }
                },
              }
            },
            timeIn: true,
            timeOut: true,
            cwp: {
              select: {
                id: true,
                cwp: true
              }
            }
          }
        }
      }
    })

    // const dutyReport = await prisma.briefing.findMany({ take: 5 });
    // const dutyReport = await prisma.user.findMany({ take: 5 });
    // const dutyReport = await prisma.$queryRaw`SELECT 1 as ok`;



    const payload = {
      timestamp: new Date().toISOString(),
      rowCount: Array.isArray(dailyReport) ? dailyReport.length : null,
      dailyReport,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));
    console.log(`✅ Debug output written to ${OUTPUT_FILE}`);
    console.log(`   Rows returned: ${payload.rowCount ?? 'N/A'}`);
  } catch (error) {
    const errorPayload = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(errorPayload, null, 2));
    console.error(`❌ Query failed. Details written to ${OUTPUT_FILE}`);
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();