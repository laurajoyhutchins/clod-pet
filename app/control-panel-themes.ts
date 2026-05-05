(() => {
  const windowsPanelStyles = [
    "windows-95",
    "windows-98",
    "windows-2000",
    "windows-xp",
    "windows-vista",
    "windows-7",
    "windows-10",
    "windows-11",
  ] as const;

  const macPanelStyles = [
    "mac-platinum",
    "mac-aqua",
    "mac-graphite",
  ] as const;

  const roundedPanelStyles = [
    "windows-xp",
    "windows-vista",
    "windows-7",
    "windows-11",
  ] as const;

  window.clodPetControlPanelThemes = {
    panelStyles: [...windowsPanelStyles, ...macPanelStyles],
    windowsPanelStyles,
    macPanelStyles,
    roundedPanelStyles,
  };
})();
