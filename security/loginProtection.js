export const calculateCooldownMs = (failedLoginCount, config) => {
  if (failedLoginCount < config.cooldownThreshold) return 0;
  if (failedLoginCount === config.cooldownThreshold) return config.firstCooldownMs;
  if (failedLoginCount === config.cooldownThreshold + 1) return config.secondCooldownMs;
  return config.maximumCooldownMs;
};

export const calculateFailureState = ({ previous, now, config }) => {
  const withinWindow = previous?.lastFailedAt &&
    now.getTime() - new Date(previous.lastFailedAt).getTime() <= config.failureWindowMs;
  const failedLoginCount = withinWindow ? previous.failedLoginCount + 1 : 1;
  const cooldownMs = calculateCooldownMs(failedLoginCount, config);

  return {
    failedLoginCount,
    firstFailedAt: withinWindow ? previous.firstFailedAt || now : now,
    lastFailedAt: now,
    lockedUntil: cooldownMs ? new Date(now.getTime() + cooldownMs) : null,
  };
};
