import prisma from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

const getMandatoryRating = async(req, res) => {
  try {
    const rating = await prisma.rating.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        rating: true,
        description: true,
        mandatoryRatings: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            mandatoryItem: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                mandatory: true
              }
            }
          }
        }
      }
    })

    const mandatoryItem = await prisma.mandatoryItems.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        mandatory: true
      }
    })

    res.status(200).json({rating, mandatoryItem});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postMandatoryRating = async(req, res) => {
  try {
    const {ratingId, mandatoryItem} = req.body

    await prisma.mandatoryRating.createMany({
      data: mandatoryItem.map(id => ({ratingId, mandatoryItemId: id}))
    })

    res.status(200).json({message: "success"});

  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message });
  }
}

const deleteMandatoryRating = async(req, res) => {
  try {
    const {id} = req.params
    const now = dayjs.utc().toDate()
    
    await prisma.mandatoryRating.update({
      where: {
        id: parseInt(id)
      },
      data: {
        deletedAt: now
      }
    })

    res.status(200).json({message: "success"});

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getMandatoryRating, postMandatoryRating, deleteMandatoryRating };