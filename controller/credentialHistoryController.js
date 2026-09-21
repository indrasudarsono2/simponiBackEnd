import prisma from "../lib/prisma.js";

const modelFor = (type) => type === "ielp" ? prisma.ielp : type === "medex" ? prisma.medex : null;

const getCredentialHistory = async (req, res) => {
  const typeParam = String(req.params.type || "").toLowerCase();
  const type = typeParam === "ielp" ? "IELP" : typeParam === "medex" ? "MEDEX" : null;
  const model = modelFor(typeParam);
  const id = Number(req.params.id);
  if (!model || !Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "A valid IELP or MEDEX record is required." });
  }

  try {
    const credential = await model.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { nik: true, name: true, branchUnitId: true } } },
    });
    if (!credential) return res.status(404).json({ message: "Credential was not found." });

    const roleNames = new Set(req.user.roleNames || []);
    const isAdmin = roleNames.has("CHECKER ADMIN") || roleNames.has("GENERAL ADMIN");
    const isOwner = credential.userNik === req.user.nik;
    const sameBranchUnit = credential.user?.branchUnitId === req.user.branchUnitId;
    if (!isOwner && !(isAdmin && sameBranchUnit)) {
      return res.status(403).json({ message: "You are not authorized to view this credential history." });
    }

    const rootCredentialId = credential.rootVersionId || credential.id;
    const [revisions, history] = await Promise.all([
      model.findMany({
        where: { rootVersionId: rootCredentialId },
        include: {
          requestedChecker: { select: { nik: true, name: true } },
          verifiedBy: { select: { nik: true, name: true } },
          applicationDocs: { where: { deletedAt: null }, select: { id: true, number: true } },
        },
        orderBy: { version: "desc" },
      }),
      prisma.credentialHistory.findMany({
        where: { credentialType: type, rootCredentialId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);

    const niks = [...new Set(history.flatMap((item) => [item.actorNik, item.checkerNik]).filter(Boolean))];
    const actors = niks.length ? await prisma.user.findMany({
      where: { nik: { in: niks } }, select: { nik: true, name: true },
    }) : [];
    const actorMap = new Map(actors.map((actor) => [actor.nik, actor]));
    const parseJson = (value) => {
      if (!value) return null;
      try { return JSON.parse(value); } catch { return null; }
    };

    res.json({
      credentialType: type,
      rootCredentialId,
      owner: credential.user,
      revisions,
      history: history.map((item) => ({
        ...item,
        actor: item.actorNik ? actorMap.get(item.actorNik) || { nik: item.actorNik, name: null } : null,
        checker: item.checkerNik ? actorMap.get(item.checkerNik) || { nik: item.checkerNik, name: null } : null,
        snapshot: parseJson(item.snapshot),
        changes: parseJson(item.changes),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getCredentialHistory };
