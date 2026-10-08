import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ctfRouter from "./ctf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ctfRouter);

export default router;
