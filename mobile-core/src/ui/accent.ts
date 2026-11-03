import { createContext, useContext } from "react";

import { Accent, accents } from "../theme";

export const AccentContext = createContext<Accent>(accents.traveler);
export const useAccent = () => useContext(AccentContext);
