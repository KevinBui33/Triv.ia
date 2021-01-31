const io = require("socket.io")
const { getQuestions } = require("../api/control");

// Models
const Question = require('../models/question.model')
const Profile = require('../models/profile.model');
const User = require('../models/user.model');

const socket_port = 4000;
const server = io.listen(socket_port)

console.log(`Socket listening on port ${socket_port}`);

const EMPTY_GAME = {
    eventID: null,
    questions: [],
    step: -1,
    players: {}
}

let game;

const getLeaderboard = async () => {
    let result = []

    for(let i=0; i<Object.keys(game.players).length; i++) {
        let socketID = Object.keys(game.players)[i]
        let playerID = game.players[socketID]

        let user = await User.findById(playerID)
        let profile = await Profile.findOne({userID: user.id})

        result.push({
            username: user.username,
            points: profile.points,
            correct: profile.correct,
            attempted: profile.attempted
        })
    }

    return result
}

server.on("connection", socket => {
    const { id } = socket.client;
    console.log("Client connected", id)

    // REGISTER --------
    socket.on("new-game", async (eventID) => {
        console.log("new game")
        game = {
            ...EMPTY_GAME,
            eventID,
            questions: await getQuestions(eventID)
        }
    })

    socket.on("new-player", async (playerID) => {
        if(game) {
            console.log("new player")
            game.players[id] = playerID
            let profile = new Profile({userID: playerID})         
            await profile.save()
        } else {
            socket.emit("cannot-join")
        }
    })

    // ADMIN ----------
    // nextQuestion() -- increment step, notify all players, check if game done
    socket.on("next-question", async () => {
        console.log("nextquestion")
        game.step += 1

        if(game.step >= game.questions.length) {
            // notify all players + admin

            return server.emit("game-end", await getLeaderboard())
        }

        // notify all players
        server.emit("new-question", ({
            question: game.questions[game.step],
            step: game.step,
            totalSteps: game.questions.length
        }))
    })

    // PLAYER ----------
    // answerQuestion() -- updatePlayer stats
    socket.on("answer-question", async (answerID) => {
        console.log("\n\n\ngoon answered:", answerID)
        const {players, questions, step} = game

        let userID = players[id]
        console.log(userID)
        let profile = await Profile.findOne({userID})

        profile.attempted += 1

        let correct;
        for(let i=0; i<questions[step].answers.length; i++) {
            // not sure if id is retrieved properly

            console.log("compare:", questions[step].answers[i]._id, answerID)
            if(questions[step].answers[i]._id == answerID) {
                correct = true;
                break;
            }
        }

        let message;
        if(correct) {
            profile.score += questions[step].score
            profile.correct += 1
            message = "correct-answer"
        } else {
            message = "wrong-answer"
        }

        await profile.save()

        // send message to curretn socket client
        socket.emit(message)
    })

    socket.on("disconnect", () => {
        console.log("Client disonnected")

        if(game && game.players[id]) delete game.players[id]
    })
});