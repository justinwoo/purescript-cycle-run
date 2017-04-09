module Control.Cycle
  ( run
  ) where

import Prelude
import Control.Monad.Eff (Eff)
import Control.XStream (Stream)
import Data.Function.Uncurried (Fn2, runFn2)

type Dispose e = Unit -> Eff e Unit

-- | Cycle run for one source input and one sink output. This is an alias for `run1`.
run :: forall e a b.
  (a -> Stream b) ->
  (Stream b -> Eff e a) ->
  Eff e (Dispose e)
run = runFn2 _run

foreign import _run :: forall e a b. Fn2
  (a -> Stream b)
  (Stream b -> Eff e a)
  (Eff e (Dispose e))
