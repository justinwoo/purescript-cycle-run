module Main where

import Prelude
import Control.Monad.Eff.JQuery as JQ
import Control.Cycle (run)
import Control.Monad.Eff (Eff)
import Control.Monad.Eff.Console (CONSOLE)
import Control.Monad.Eff.Timer (TIMER)
import Control.XStream (STREAM, Stream, addListener, defaultListener, periodic, startWith)
import DOM (DOM)
import Data.Generic (class Generic, gShow)

data Query
  = Timer Int

data Command
  = Display String
derive instance genericCommand :: Generic Command
instance showCommand :: Show Command where
  show = gShow

type AppEff e =
    Eff
    ( dom :: DOM
    , console :: CONSOLE
    , stream :: STREAM
    , timer :: TIMER
    | e
    )

main_ :: Stream Query -> Stream Command
main_ queries =
  inner <$> queries
  where
    inner (Timer x) =
      Display (show x)

driver :: forall e.
  Stream Command
  -> AppEff e (Stream Query)
driver commands = do
  logCommands
  display
  ticks <- startWith (0) <$> periodic 1000
  pure $ Timer <$> ticks
  where
    logCommands =
      addListener
        defaultListener
        commands
    display = do
      JQ.ready $ do
        body <- JQ.body
        div <- JQ.create "<div>"
        h1 <- JQ.create "<h1>Periodic:</h1>"
        h2 <- JQ.create "<h2>"
        JQ.append h1 div
        JQ.append h2 div
        JQ.append div body
        addListener
          defaultListener
            { next = \x -> JQ.setText x h2
            }
          $ commands >>=
            case _ of
              Display xs -> pure xs

main :: forall e. AppEff e Unit
main =
    void $ run main_ driver
