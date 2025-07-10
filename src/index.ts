import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import session from "express-session";
import bodyParser from "body-parser";
import passport from "passport";
import { Strategy as localStrategy } from "passport-local";
import dotenv from "dotenv";
import express, {
  type Request,
  type Response,
  type NextFunction,
  RequestHandler,
} from "express";

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
    }
  }
}

dotenv.config({ path: "../.env" });

const port = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const sessionMiddleware = session({
  cookie: { maxAge: 60 * 1000 * 10 },
  secret: "changeit",
  resave: true,
  saveUninitialized: true,
});

app.use(sessionMiddleware);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());

const __dirname = dirname(fileURLToPath(import.meta.url));
const __htmlFiles = join(__dirname, "html");

passport.use(
  new localStrategy((username, password, done) => {
    if (username === "Ish" && password === "Ish") {
      console.log("authentication was a success");
      return done(null, { id: 1, username });
    } else {
      console.log("failed to authenticate");
      return done(null, false);
    }
  })
);

passport.serializeUser((user, cb) => {
  console.log(`serializeser ${user.id}`);
  cb(null, user);
});

passport.deserializeUser((user: Express.User, cb) => {
  console.log(`deserializeUser ${user.id}`);
  cb(null, user);
});

app.get("/", (req, res) => {
  if (!req.user) {
    return res.redirect("/login");
  }
  res.sendFile(join(__htmlFiles, "index.html"));
});

app.get("/login", (req, res) => {
  if (req.user) {
    return res.redirect("/");
  }
  res.sendFile(join(__htmlFiles, "login.html"));
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/",
  })
);

app.post("/logout", (req, res) => {
  const sessionId = req.session.id;
  req.session.destroy(() => {
    // disconnect all Socket.IO connections linked to this session ID
    io.to(`session:${sessionId}`).disconnectSockets();
    res.status(204).end();
  });
});

function onlyForHandshake(middleware: RequestHandler) {
  return (
    req: Request & { _query: Record<string, string> },
    res: Response,
    next: NextFunction
  ) => {
    const isHandshake = req._query.sid === undefined;
    if (isHandshake) {
      middleware(req, res, next);
    } else {
      next();
    }
  };
}
io.engine.use(onlyForHandshake(sessionMiddleware));
io.engine.use(onlyForHandshake(passport.session()));
io.engine.use(
  onlyForHandshake((req, res, next) => {
    if (req.user) {
      next();
    } else {
      res.writeHead(401);
      res.end();
    }
  })
);

io.on("connection", (socket) => {
  const req = socket.request as Request & { user: Express.User };

  socket.join(`session:${req.session.id}`);
  socket.join(`user:${req.user.id}`);

  socket.on("whoami", (cb) => {
    cb(req.user.username);
  });
});

httpServer.listen(port, () => {
  console.log(`application is running at: http://localhost:${port}`);
});
