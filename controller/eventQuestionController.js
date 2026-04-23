import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const getEventQuestions = async (req, res) => {
  try {
    const branchUnitId = req.user.branchUnitId;
    // const branchUnitId = 17
   const allAtribute = await prisma.branchUnit.findFirst({
      where: {
        id: branchUnitId
      },
      select: {
        id: true,
        unit: true,
        branch: {
          where: {
            deletedAt: null
          },
          select: {
            branch: true
          }
        },
        sessions: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            session: true,
            events: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                event: true,
                sectorId: true
              }
            }
          }
        }
      }
    })
    
    const eventId = allAtribute.sessions.flatMap(s => s.events.map(event => event.id))
    const evenQuestion = await prisma.eventQuestion.findMany({
      where: {
        deletedAt: null,
        eventId :{
          in: eventId
        }
      },
      select: {
        event: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            event: true
          }
        },
        kindOfQuestion: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            question: true
          }
        },
        quantity: true,
        persentage: true,
        minutes: true
      }
    })

    const kindOfQuestion = await prisma.kindOfQuestion.findMany({
      where: {
        deletedAt: null
      }
    })
  
    res.json({allAtribute,evenQuestion, kindOfQuestion});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addEventQuestions = async (req, res) => {
  try {
    const {eventId, sectorId, kindOfQuestionId, quantity, persentage, minutes} = req.body
    
    await prisma.eventQuestion.create({
      data: {
        eventId,
        sectorId,
        kindOfQuestionId,
        quantity,
        persentage,
        minutes
      }
    })

    res.status(201).json({ success: true});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
const getEventQuestionById = async (req, res) => {
  try {
    const { id } = req.params;
    const {eventId, sectorId, kindOfQuestionId, quantity, persentage, minutes} = req.body
    await prisma.eventQuestion.update({
      where: {
        id: parseInt(id)
      },
      data: {
        eventId,
        sectorId,
        kindOfQuestionId,
        quantity,
        persentage,
        minutes
      }
    })
    
    res.status(201).json({ success: true});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteEventQuestionId = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
    
    await prisma.eventQuestion.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.status(201).json({ success: true});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getEventQuestions, addEventQuestions, getEventQuestionById, deleteEventQuestionId };
