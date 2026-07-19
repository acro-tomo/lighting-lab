import { projectSchema } from "../schema/projectSchema";
import type { Project } from "../types";
import demoProjectData from "./demoProject.json";

export const demoProject = projectSchema.parse(demoProjectData) as Project;
