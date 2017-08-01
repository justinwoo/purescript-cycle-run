module Main where

import Prelude

import Control.Cycle (runRecord)
import Control.Monad.Eff (Eff)
import Control.Monad.Eff.Console (CONSOLE)
import Control.Monad.Eff.JQuery as JQ
import Control.Monad.Eff.Timer (TIMER)
import Control.XStream (STREAM, Stream, addListener, defaultListener, periodic, startWith)
import DOM (DOM)
import Data.Monoid (mempty)

type AppEff e =
    Eff
    ( dom :: DOM
    , console :: CONSOLE
    , stream :: STREAM
    , timer :: TIMER
    | e
    )

main_ :: { display :: Stream Unit, timer :: Stream Int } -> { display :: Stream String, timer :: Stream Unit }
main_ {timer} =
  { display: show <$> timer
  , timer: mempty
  }

driver :: forall e.
  { display :: Stream String -> AppEff e (Stream Unit)
  , timer :: Stream Unit -> AppEff e (Stream Int)
  }
driver =
  { display
  , timer
  }
  where
    timer _ = do
      startWith 0 <$> periodic 1000
    display strings = do
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
          strings
      pure mempty

main :: forall e. AppEff e Unit
main =
    void $ runRecord main_ driver
