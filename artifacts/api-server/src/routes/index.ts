import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ctfRouter from "./ctf";
import lanternRouter from "./lantern";
import classroomRouter from "./classroom";

const router: IRouter = Router();

router.use(healthRouter);
router.use(classroomRouter);
router.use(ctfRouter);
router.use(lanternRouter);

export default router;
