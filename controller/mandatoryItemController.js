import prisma from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

const getMandatoryItem = async(req, res) => {
  try {
    const mandatory = await prisma.mandatoryItems.findMany({
      where: {
        deletedAt: null
      }
    })

    res.status(200).json({mandatory});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postMandatoryItem = async(req, res) => {
  try {
    const {mandatory} = req.body

    await prisma.mandatoryItems.create({
      data: {
        mandatory
      }
    })

    res.status(200).json({message: "success"});

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const updateMandatoryItem = async(req, res) => {
  try {
    const {id} = req.params
    const {mandatory} = req.body

    await prisma.mandatoryItems.update({
      where: {
        id: parseInt(id)
      },
      data: {
        mandatory
      }
    })

    res.status(200).json({message: "success"});

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const deleteMandatoryItem = async(req, res) => {
  try {
    const {id} = req.params
    const now = dayjs.utc().toDate()
  
    await prisma.mandatoryItems.update({
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

export { getMandatoryItem, postMandatoryItem, updateMandatoryItem, deleteMandatoryItem };