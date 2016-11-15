module Main where

import Prelude
import Control.Monad.Eff.JQuery as JQ
import Control.Alternative (empty)
import Control.Cycle (CYCLE, run2)
import Control.Monad.Eff (Eff)
import Control.Monad.Eff.Console (log, CONSOLE)
import Control.Monad.Eff.Timer (TIMER)
import Control.XStream (filter, startWith, Stream, STREAM, defaultListener, addListener, periodic)
import DOM (DOM)
import Data.Tuple.Nested (tuple2)

main :: forall e.
  Eff
    ( cycle :: CYCLE
    , stream :: STREAM
    , timer :: TIMER
    , dom :: DOM
    , console :: CONSOLE
    | e
    )
    Unit
main =
    run2 sinks drivers
    where
      sinks timer _ =
        tuple2 (empty :: Stream Unit) (show <$> timer)
      drivers =
        tuple2
          (\_ -> filter (_ > 0) <$> startWith (-1) <$> periodic 1000)
          (\s -> do
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
                    { next = \x -> do
                        log x
                        JQ.setText x h2
                    }
                  s)
